<?php

namespace WordPress\AsyncHttp;

class Response {

	public $protocol;
	public $status_code;
	public $status_message;
	public $headers = [];
	public $request;

	public $received_bytes = 0;
	public $total_bytes = null;

	public function __construct( Request $request ) {
		$this->request = $request;
	}

	public function get_header( $name ) {
		return $this->headers[ strtolower( $name ) ] ?? false;
	}

}
