<?php

namespace WordPress\ByteReader;

class WP_String_Reader extends WP_Byte_Reader {

	const STATE_STREAMING = '#streaming';
	const STATE_FINISHED  = '#finished';

	protected $string;
	protected $chunk_size;
	protected $offset = 0;
	protected $output_bytes = '';
	protected $last_chunk_size = 0;
	protected $last_error;
	protected $state = self::STATE_STREAMING;

	static public function create($string, $chunk_size = 8096) {
		if (!is_string($string)) {
			_doing_it_wrong(__METHOD__, 'Input must be a string', '1.0.0');
			return false;
		}
		return new self($string, $chunk_size);
	}

	private function __construct($string, $chunk_size) {
		$this->string = $string;
		$this->chunk_size = $chunk_size;
	}

	public function length(): ?int {
		return strlen($this->string);
	}

	public function tell(): int {
		return $this->offset - $this->last_chunk_size;
	}

	public function seek($offset): bool {
		if (!is_int($offset)) {
			_doing_it_wrong(__METHOD__, 'Cannot set cursor to a non-integer offset.', '1.0.0');
			return false;
		}
		if ($offset < 0 || $offset > strlen($this->string)) {
			return false;
		}
		$this->offset = $offset;
		$this->last_chunk_size = 0;
		$this->output_bytes = '';
		return true;
	}

	public function close(): bool {
		$this->state = static::STATE_FINISHED;
		return true;
	}

	public function is_finished(): bool {
		return !$this->output_bytes && $this->state === static::STATE_FINISHED;
	}

	public function get_bytes(): string {
		return $this->output_bytes;
	}

	public function get_last_error(): ?string {
		return $this->last_error;
	}

	public function next_bytes(): bool {
		$this->output_bytes = '';
		$this->last_chunk_size = 0;

		if ($this->last_error || $this->is_finished()) {
			return false;
		}

		if ($this->offset >= strlen($this->string)) {
			$this->state = static::STATE_FINISHED;
			return false;
		}

		$bytes = substr($this->string, $this->offset, $this->chunk_size);
		$this->last_chunk_size = strlen($bytes);
		$this->offset += $this->last_chunk_size;
		$this->output_bytes = $bytes;

		return true;
	}
}
