<?php

use League\CommonMark\Environment\Environment;
use League\CommonMark\Extension\CommonMark\CommonMarkCoreExtension;
use League\CommonMark\Extension\GithubFlavoredMarkdownExtension;
use League\CommonMark\Parser\MarkdownParser;
use League\CommonMark\Extension\CommonMark\Node\Block as ExtensionBlock;
use League\CommonMark\Extension\CommonMark\Node\Inline as ExtensionInline;
use League\CommonMark\Node\Block;
use League\CommonMark\Node\Inline;
use League\CommonMark\Extension\Table\Table;
use League\CommonMark\Extension\Table\TableCell;
use League\CommonMark\Extension\Table\TableRow;
use League\CommonMark\Extension\Table\TableSection;

/**
 * Transforms markdown with frontmatter into a block markup and metadata pair.
 *
 * @TODO
 * * Transform images to image blocks, not inline <img> tags. Otherwise their width
 *   exceeds that of the paragraph block they're in.
 * * Consider implementing a dedicated markdown parser – similarly how we have
 *   a small, dedicated, and fast XML, HTML, etc. parsers. It would solve for
 *   code complexity, bundle size, performance, PHP compatibility, etc.
 */
class WP_Markdown_Consumer implements WP_Data_Format_Consumer {

	private $block_stack = array();
	private $table_stack = array();

	private $frontmatter = array();
	private $markdown;
	private $block_markup = '';
	private $blocks_with_metadata;

	public function __construct( $markdown ) {
		$this->markdown = $markdown;
	}

	public function consume() {
		if ( ! $this->blocks_with_metadata ) {
			$this->convert_markdown_to_blocks();
			$this->blocks_with_metadata = new WP_Blocks_With_Metadata( $this->block_markup, $this->frontmatter );
		}
		return $this->blocks_with_metadata;
	}

	public function get_all_metadata( $options = array() ) {
		$metadata = $this->frontmatter;
		if ( isset( $options['first_value_only'] ) && $options['first_value_only'] ) {
			$metadata = array_map(
				function ( $value ) {
					return $value[0];
				},
				$metadata
			);
		}
		return $metadata;
	}

	public function get_meta_value( $key ) {
		if ( ! array_key_exists( $key, $this->frontmatter ) ) {
			return null;
		}
		return $this->frontmatter[ $key ][0];
	}

	public function get_block_markup() {
		return $this->block_markup;
	}

	private function convert_markdown_to_blocks() {
		$environment = new Environment( array() );
		$environment->addExtension( new CommonMarkCoreExtension() );
		$environment->addExtension( new GithubFlavoredMarkdownExtension() );
		$environment->addExtension(
			new \Webuni\FrontMatter\Markdown\FrontMatterLeagueCommonMarkExtension(
				new \Webuni\FrontMatter\FrontMatter()
			)
		);

		$parser            = new MarkdownParser( $environment );
		$document          = $parser->parse( $this->markdown );
		$this->frontmatter = array();
		foreach ( $document->data->export() as $key => $value ) {
			if ( 'attributes' === $key && empty( $value ) ) {
				// The Frontmatter extension adds an 'attributes' key to the document data
				// even when there is no actual "attributes" key in the frontmatter.
				//
				// Let's skip it when the value is empty.
				continue;
			}
			// Use an array as a value to comply with the WP_Block_Markup_Converter interface.
			$this->frontmatter[ $key ] = array( $value );
		}

		$walker = $document->walker();
		while ( true ) {
			$event = $walker->next();
			if ( ! $event ) {
				break;
			}
			$node = $event->getNode();

			if ( $event->isEntering() ) {
				switch ( get_class( $node ) ) {
					case Block\Document::class:
						// Ignore
						break;

					case ExtensionBlock\Heading::class:
						$this->push_block(
							'heading',
							array(
								'level' => $node->getLevel(),
							)
						);
						$this->append_content( '<h' . $node->getLevel() . '>' );
						break;

					case ExtensionBlock\ListBlock::class:
						$attrs = array(
							'ordered' => $node->getListData()->type === 'ordered',
						);
						if ( $node->getListData()->start && $node->getListData()->start !== 1 ) {
							$attrs['start'] = $node->getListData()->start;
						}
						$this->push_block(
							'list',
							$attrs
						);

						$tag = $attrs['ordered'] ? 'ol' : 'ul';
						$this->append_content( '<' . $tag . ' class="wp-block-list">' );
						break;

					case ExtensionBlock\ListItem::class:
						$this->push_block( 'list-item' );
						$this->append_content( '<li>' );
						break;

					case Table::class:
						$this->push_block( 'table' );
						$this->append_content( '<figure class="wp-block-table"><table class="has-fixed-layout">' );
						break;

					case TableSection::class:
						$is_head = $node->isHead();
						array_push( $this->table_stack, $is_head ? 'head' : 'body' );
						$this->append_content( $is_head ? '<thead>' : '<tbody>' );
						break;

					case TableRow::class:
						$this->append_content( '<tr>' );
						break;

					case TableCell::class:
						/** @var TableCell $node */
						$is_header = $this->current_block() && $this->current_block()->block_name === 'table' && end( $this->table_stack ) === 'head';
						$tag       = $is_header ? 'th' : 'td';
						$this->append_content( '<' . $tag . '>' );
						break;

					case ExtensionBlock\BlockQuote::class:
						$this->push_block( 'quote' );
						$this->append_content( '<blockquote class="wp-block-quote">' );
						break;

					case ExtensionBlock\FencedCode::class:
					case ExtensionBlock\IndentedCode::class:
						$attrs = array(
							'language' => null,
						);
						if ( method_exists( $node, 'getInfo' ) && $node->getInfo() ) {
							$attrs['language'] = preg_replace( '/[ \t\r\n\f].*/', '', $node->getInfo() );
						}
						if ( 'block' === $attrs['language'] ) {
							// This is a special case for preserving block literals that could not be expressed as markdown.
							$this->append_content( "\n" . $node->getLiteral() . "\n" );
						} else {
							$this->push_block( 'code', $attrs );
							$this->append_content( '<pre class="wp-block-code"><code>' . trim( str_replace( "\n", '<br>', htmlspecialchars( $node->getLiteral() ) ) ) . '</code></pre>' );
						}
						break;

					case ExtensionBlock\HtmlBlock::class:
						$this->push_block( 'html' );
						$this->append_content( $node->getLiteral() );
						break;

					case ExtensionBlock\ThematicBreak::class:
						$this->push_block( 'separator' );
						$this->append_content( '<hr class="wp-block-separator has-alpha-channel-opacity"/>' );
						break;

					case Block\Paragraph::class:
						$current_block = $this->current_block();
						if ( $current_block && $current_block->block_name === 'list-item' ) {
							break;
						}
						$this->push_block( 'paragraph' );
						$this->append_content( '<p>' );
						break;

					case Inline\Newline::class:
						$this->append_content( "\n" );
						break;

					case Inline\Text::class:
						$this->append_content( $node->getLiteral() );
						break;

					case ExtensionInline\Code::class:
						$this->append_content( '<code>' . htmlspecialchars( $node->getLiteral() ) . '</code>' );
						break;

					case ExtensionInline\Strong::class:
						$this->append_content( '<b>' );
						break;

					case ExtensionInline\Emphasis::class:
						$this->append_content( '<em>' );
						break;

					case ExtensionInline\HtmlInline::class:
						$this->append_content( htmlspecialchars( $node->getLiteral() ) );
						break;

					case ExtensionInline\Image::class:
						$html = new WP_HTML_Tag_Processor( '<img>' );
						$html->next_tag();
						if ( $node->getUrl() ) {
							$html->set_attribute( 'src', urldecode( $node->getUrl() ) );
						}
						if ( $node->getTitle() ) {
							$html->set_attribute( 'title', $node->getTitle() );
						}

						$children = $node->children();
						if ( count( $children ) > 0 && $children[0] instanceof Inline\Text && $children[0]->getLiteral() ) {
							$html->set_attribute( 'alt', $children[0]->getLiteral() );
							// Empty the text node so it will not be rendered twice: once in as an alt="",
							// and once as a new paragraph block.
							$children[0]->setLiteral( '' );
						}

						$image_tag = $html->get_updated_html();
						// @TODO: Decide between inline image and the image block
						if ( $this->drop_current_paragraph_if_empty() ) {
							$image_block = <<<BLOCK
							<!-- wp:image -->
							<figure class="wp-block-image size-full">
								$image_tag
							</figure>
							<!-- /wp:image -->
BLOCK;
							$this->append_content( $image_block );
							$this->push_block( 'paragraph' );
							$this->append_content( '<p>' );
						} else {
							$this->append_content( $image_tag );
						}
						break;

					case ExtensionInline\Link::class:
						$html = new WP_HTML_Tag_Processor( '<a>' );
						$html->next_tag();
						if ( $node->getUrl() ) {
							$html->set_attribute( 'href', $node->getUrl() );
						}
						if ( $node->getTitle() ) {
							$html->set_attribute( 'title', $node->getTitle() );
						}
						$this->append_content( $html->get_updated_html() );
						break;

					default:
						error_log( 'Unhandled node type: ' . get_class( $node ) );
						return null;
				}
			} else {
				switch ( get_class( $node ) ) {
					case ExtensionBlock\BlockQuote::class:
						$this->append_content( '</blockquote>' );
						$this->pop_block();
						break;
					case ExtensionBlock\ListBlock::class:
						$attrs = $this->current_block()->attrs;
						if ( $attrs['ordered'] ) {
							$this->append_content( '</ol>' );
						} else {
							$this->append_content( '</ul>' );
						}
						$this->pop_block();
						break;
					case ExtensionBlock\ListItem::class:
						$this->append_content( '</li>' );
						$this->pop_block();
						break;
					case ExtensionBlock\Heading::class:
						$this->append_content( '</h' . $node->getLevel() . '>' );
						$this->pop_block();
						break;
					case ExtensionInline\Strong::class:
						$this->append_content( '</b>' );
						break;
					case ExtensionInline\Emphasis::class:
						$this->append_content( '</em>' );
						break;
					case ExtensionInline\Link::class:
						$this->append_content( '</a>' );
						break;
					case TableSection::class:
						$is_head = $node->isHead();
						array_pop( $this->table_stack );
						$this->append_content( $is_head ? '</thead>' : '</tbody>' );
						break;
					case TableRow::class:
						$this->append_content( '</tr>' );
						break;
					case TableCell::class:
						$is_header = $this->current_block() && $this->current_block()->block_name === 'table' && end( $this->table_stack ) === 'head';
						$tag       = $is_header ? 'th' : 'td';
						$this->append_content( '</' . $tag . '>' );
						break;
					case Table::class:
						$this->append_content( '</table></figure>' );
						$this->pop_block();
						break;

					case Block\Paragraph::class:
						if ( $this->current_block()->block_name === 'list-item' ) {
							break;
						}
						if ( ! $this->drop_current_paragraph_if_empty() ) {
							$this->append_content( '</p>' );
							$this->pop_block();
						}
						break;

					case Inline\Text::class:
					case Inline\Newline::class:
					case Block\Document::class:
					case ExtensionInline\Code::class:
					case ExtensionInline\HtmlInline::class:
					case ExtensionInline\Image::class:
						// Ignore, don't pop any blocks.
						break;
					default:
						$this->pop_block();
						break;
				}
			}
		}
	}

	private function drop_current_paragraph_if_empty() {
		if ( $this->current_block()->block_name !== 'paragraph' ) {
			return false;
		}
		$str = strrev( $this->block_markup );
		$at  = 0;

		// Skip the whitespace
		$at += strspn( $str, " \n\r\t", $at );

		// Skip the <p> tag
		$p_tag = strrev( '<p>' );
		if ( $p_tag !== substr( $str, $at, strlen( $p_tag ) ) ) {
			return false;
		}
		$at += strlen( $p_tag );

		// Skip the whitespace
		$at += strspn( $str, " \n\r\t", $at );

		// Skip the block opener
		$block_opener = strrev( '<!-- wp:paragraph -->' );
		if ( $block_opener !== substr( $str, $at, strlen( $block_opener ) ) ) {
			return false;
		}
		$at             += strlen( $block_opener );
		$paragraph_start = strlen( $str ) - $at;

		$this->pop_block();
		$this->block_markup = substr( $this->block_markup, 0, $paragraph_start );
		return true;
	}

	private function append_content( $content ) {
		$this->block_markup .= $content;
	}

	private function push_block( $name, $attributes = array() ) {
		$block = new WP_Block_Object(
			$name,
			$attributes
		);
		array_push( $this->block_stack, $block );
		$this->block_markup .= WP_Import_Utils::block_opener( $block->block_name, $block->attrs ) . "\n";
	}

	private function pop_block() {
		if ( ! empty( $this->block_stack ) ) {
			$popped              = array_pop( $this->block_stack );
			$this->block_markup .= WP_Import_Utils::block_closer( $popped->block_name ) . "\n";
			return $popped;
		}
	}

	private function current_block() {
		return end( $this->block_stack );
	}
}
