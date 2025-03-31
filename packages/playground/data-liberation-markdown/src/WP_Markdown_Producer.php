<?php

/**
 * Converts WordPress blocks and metadata to Markdown with frontmatter.
 */
class WP_Markdown_Producer implements WP_Data_Format_Producer {
	private $block_markup;
	private $state;
	private $parents = array();
	private $metadata;
	private $markdown;

	public function __construct( $block_markup, $metadata = array() ) {
		$this->block_markup = $block_markup;
		$this->state        = array(
			'indent' => array(),
			'listStyle' => array(),
		);
		$this->metadata     = $metadata;
	}

	public function produce() {
		if ( null === $this->markdown ) {
			$this->markdown  = '';
			$this->markdown .= $this->frontmatter();
			$this->markdown .= $this->blocks_to_markdown( parse_blocks( $this->block_markup ) );
		}
		return $this->markdown;
	}

	private function frontmatter() {
		if ( empty( $this->metadata ) ) {
			return '';
		}
		$frontmatter = '';
		foreach ( $this->metadata as $key => $value ) {
			$frontmatter .= "$key: " . json_encode( $value ) . "\n";
		}
		return "---\n$frontmatter---\n\n";
	}

	private function blocks_to_markdown( $blocks ) {
		$output = '';
		foreach ( $blocks as $block ) {
			array_push( $this->parents, $block['blockName'] );
			$output .= $this->block_to_markdown( $block );
			array_pop( $this->parents );
		}
		return $output;
	}

	private function block_to_markdown( $block ) {
		$block_name   = $block['blockName'];
		$attributes   = $block['attrs'] ?? array();
		$inner_html   = $block['innerHTML'] ?? '';
		$inner_blocks = $block['innerBlocks'] ?? array();

		switch ( $block_name ) {
			case 'core/paragraph':
				return $this->html_to_markdown( $inner_html ) . "\n\n";

			case 'core/quote':
				$content = $this->blocks_to_markdown( $inner_blocks );
				$lines   = explode( "\n", $content );
				return implode(
					"\n",
					array_map(
						function ( $line ) {
							return "> $line";
						},
						$lines
					)
				) . "\n\n";

			case 'core/code':
				$code     = $this->html_to_markdown( $inner_html );
				$language = $attributes['language'] ?? '';
				$fence    = str_repeat( '`', max( 3, $this->longest_sequence_of( $code, '`' ) + 1 ) );
				return "{$fence}{$language}\n{$code}\n{$fence}\n\n";

			case 'core/image':
				if ( ! isset( $attributes['url'] ) ) {
					$processor = WP_Data_Liberation_HTML_Processor::create_fragment( $inner_html );
					if ( $processor->next_tag( 'img' ) ) {
						$attributes['url'] = $processor->get_attribute( 'src' );
						$attributes['alt'] = $processor->get_attribute( 'alt' );
					}
				}

				$escaped_url = self::escape_url(
					$attributes['url'] ?? ''
				);

				$escaped_alt = $attributes['alt'] ?? '';
				$escaped_alt = str_replace( array( '[', ']' ), '', $escaped_alt );
				return '![' . $escaped_alt . '](' . $escaped_url . ")\n\n";

			case 'core/heading':
				$level = $attributes['level'] ?? null;
				if ( null === $level ) {
					$processor = WP_Data_Liberation_HTML_Processor::create_fragment( $inner_html );
					if ( $processor->next_tag() ) {
						$tag = $processor->get_tag();
						if ( strlen( $tag ) > 1 && is_numeric( $tag[1] ) ) {
							$level = (int) $tag[1];
						}
					}
					if ( null === $level ) {
						$level = 1;
					}
				}
				$content = $this->html_to_markdown( $inner_html );
				return str_repeat( '#', $level ) . ' ' . $content . "\n\n";

			case 'core/table':
				// Accumulate all the table contents to compute the markdown
				// column widths.
				$processor   = WP_Data_Liberation_HTML_Processor::create_fragment( $inner_html );
				$rows        = array();
				$header      = array();
				$in_header   = false;
				$current_row = array();

				while ( $processor->next_token() ) {
					if ( $processor->get_token_type() !== '#tag' ) {
						continue;
					}

					$tag       = $processor->get_tag();
					$is_closer = $processor->is_tag_closer();

					if ( $tag === 'THEAD' && ! $is_closer ) {
						$in_header = true;
					} elseif ( $tag === 'THEAD' && $is_closer ) {
						$in_header = false;
					} elseif ( $tag === 'TR' && $is_closer ) {
						if ( $in_header ) {
							$header = $current_row;
						} else {
							$rows[] = $current_row;
						}
						$current_row = array();
					} elseif ( ( $tag === 'TH' || $tag === 'TD' ) && ! $is_closer ) {
						$cell_content  = $processor->get_inner_html();
						$current_row[] = $this->html_to_markdown( $cell_content );
						$processor->skip_to_closer();
					}
				}

				if ( empty( $header ) && ! empty( $rows ) ) {
					$header = array_shift( $rows );
				}

				if ( empty( $header ) ) {
					return '';
				}

				$col_widths = array_map( 'strlen', $header );
				foreach ( $rows as $row ) {
					foreach ( $row as $i => $cell ) {
						$col_widths[ $i ] = max( $col_widths[ $i ], strlen( $cell ) );
					}
				}

				$padded_header = array_map(
					function ( $cell, $width ) {
						return str_pad( $cell, $width );
					},
					$header,
					$col_widths
				);
				$markdown      = '| ' . implode( ' | ', $padded_header ) . " |\n";

				$separator_cells = array_map(
					function ( $width ) {
						return str_repeat( '-', $width + 2 );
					},
					$col_widths
				);
				$markdown       .= '|' . implode( '|', $separator_cells ) . "|\n";

				foreach ( $rows as $row ) {
					$padded_cells = array_map(
						function ( $cell, $width ) {
							return str_pad( $cell, $width );
						},
						$row,
						$col_widths
					);
					$markdown    .= '| ' . implode( ' | ', $padded_cells ) . " |\n";
				}

				return $markdown . "\n";

			case 'core/list':
				array_push(
					$this->state['listStyle'],
					array(
						'style' => isset( $attributes['ordered'] ) ? ( $attributes['type'] ?? 'decimal' ) : '-',
						'count' => $attributes['start'] ?? 1,
					)
				);
				$list = $this->blocks_to_markdown( $inner_blocks );
				array_pop( $this->state['listStyle'] );
				if ( $this->has_parent( 'core/list-item' ) ) {
					return $list;
				}
				return $list . "\n";

			case 'core/list-item':
				if ( empty( $this->state['listStyle'] ) ) {
					return '';
				}

				$item          = end( $this->state['listStyle'] );
				$bullet        = $this->get_list_bullet( $item );
				$bullet_indent = str_repeat( ' ', strlen( $bullet ) + 1 );

				$content       = $this->html_to_markdown( $inner_html );
				$content_parts = explode( "\n", $content, 2 );
				$content_parts = array_map( 'trim', $content_parts );
				$first_line    = $content_parts[0];
				$rest_lines    = $content_parts[1] ?? '';

				++$item['count'];

				if ( empty( $inner_html ) ) {
					$output = implode( '', $this->state['indent'] ) . "$bullet $first_line\n";
					array_push( $this->state['indent'], $bullet_indent );
					if ( $rest_lines ) {
						$output .= $this->indent( $rest_lines, $bullet_indent );
					}
					array_pop( $this->state['indent'] );
					return $output;
				}

				$markdown = $this->indent( "$bullet $first_line\n" );

				array_push( $this->state['indent'], $bullet_indent );
				if ( $rest_lines ) {
					$markdown .= $this->indent( $rest_lines ) . "\n";
				}
				$inner_blocks_markdown = $this->blocks_to_markdown(
					$inner_blocks
				);
				if ( $inner_blocks_markdown ) {
					$markdown .= $inner_blocks_markdown . "\n";
				}
				array_pop( $this->state['indent'] );

				$markdown = rtrim( $markdown, "\n" );
				if ( $this->has_parent( 'core/list-item' ) ) {
					$markdown .= "\n";
				} else {
					$markdown .= "\n\n";
				}

				return $markdown;

			case 'core/separator':
				return "\n---\n\n";

			default:
				// Short-circuit empty entries produced by the block parser.
				if ( ! $block_name ) {
					return '';
				}
				$markdown   = array();
				$markdown[] = '';
				$markdown[] = '```block';
				$markdown[] = serialize_block( $block );
				$markdown[] = '```';
				$markdown[] = '';
				return implode( "\n", $markdown );
		}
	}

	private function html_to_markdown( $html, $parents = array() ) {
		$processor = WP_Data_Liberation_HTML_Processor::create_fragment( $html );
		$markdown  = '';

		$last_href = null;
		while ( $processor->next_token() ) {
			if ( $processor->get_token_type() === '#text' ) {
				$markdown .= $processor->get_modifiable_text();
				continue;
			} elseif ( $processor->get_token_type() !== '#tag' ) {
				continue;
			}

			$tag_name = $processor->get_tag();
			$sign     = $processor->is_tag_closer() ? '-' : (
				$processor->expects_closer() ? '+' : ''
			);
			$event    = $sign . $tag_name;
			switch ( $event ) {
				case '+B':
				case '-B':
				case '+STRONG':
				case '-STRONG':
					$markdown .= '**';
					break;

				case '+I':
				case '-I':
				case '+EM':
				case '-EM':
					$markdown .= '*';
					break;

				case '+DEL':
				case '-DEL':
					$markdown .= '~~';
					break;

				case '+CODE':
				case '-CODE':
					if ( ! $this->has_parent( 'core/code' ) ) {
						$markdown .= '`';
					}
					break;

				case '+A':
					$last_href = self::escape_url(
						$processor->get_attribute( 'href' ) ?? ''
					);
					$markdown .= '[';
					break;

				case '-A':
					$markdown .= "]($last_href)";
					$last_href = null;
					break;

				case 'BR':
					$markdown .= "\n";
					break;
			}
		}

		// The HTML processor gives us all the whitespace verbatim
		// as it was encountered in the byte stream.
		// Let's normalize it to a single space.
		$markdown = trim( $markdown, "\n " );
		$markdown = preg_replace( '/ +/', ' ', $markdown );
		$markdown = preg_replace( '/\n+/', "\n", $markdown );
		return $markdown;
	}

	// @TODO: Figure out the correct markdown escaping for URLs
	private static function escape_url( $url ) {
		$escaped_url = str_replace( ' ', '%20', $url );
		$escaped_url = str_replace( ')', '%29', $escaped_url );
		return $escaped_url;
	}

	private function has_parent( $parent_block_name ) {
		return in_array( $parent_block_name, $this->parents, true );
	}

	private function get_list_bullet( $item ) {
		if ( $item['style'] === '-' ) {
			return '-';
		}
		return $item['count'] . '.';
	}

	private function indent( $data ) {
		if ( empty( $this->state['indent'] ) ) {
			return $data;
		}

		$indent = implode( '', $this->state['indent'] );
		$lines  = explode( "\n", $data );
		return implode(
			"\n",
			array_map(
				function ( $line ) use ( $indent ) {
					return empty( $line ) ? $line : $indent . $line;
				},
				$lines
			)
		);
	}

	private function longest_sequence_of( $input, $substring ) {
		$longest = 0;
		$current = 0;
		$len     = strlen( $input );

		for ( $i = 0; $i < $len; $i++ ) {
			if ( $input[ $i ] === $substring ) {
				++$current;
				$longest = max( $longest, $current );
			} else {
				$current = 0;
			}
		}

		return $longest;
	}
}
