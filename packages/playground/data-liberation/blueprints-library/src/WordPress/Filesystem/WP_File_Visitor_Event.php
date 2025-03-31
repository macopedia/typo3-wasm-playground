<?php

namespace WordPress\Filesystem;

class WP_File_Visitor_Event {
	public $type;
	/**
	 * @var string
	 */
	public $dir;
	/**
	 * @var array<string>
	 */
	public $files;

	const EVENT_ENTER = 'entering';
	const EVENT_EXIT  = 'exiting';

	public function __construct( $type, $dir, $files = array() ) {
		$this->type  = $type;
		$this->dir   = $dir;
		$this->files = $files;
	}

	public function is_entering() {
		return $this->type === self::EVENT_ENTER;
	}

	public function is_exiting() {
		return $this->type === self::EVENT_EXIT;
	}
}
