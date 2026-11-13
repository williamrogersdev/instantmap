#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodeError(pub &'static str);

impl std::fmt::Display for DecodeError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.0)
    }
}

impl std::error::Error for DecodeError {}

pub type Result<T> = std::result::Result<T, DecodeError>;

pub struct Reader<'a> {
    bytes: &'a [u8],
    offset: usize,
}

impl<'a> Reader<'a> {
    pub fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, offset: 0 }
    }

    pub fn done(&self) -> bool {
        self.offset >= self.bytes.len()
    }

    pub fn varint(&mut self) -> Result<u64> {
        let mut result = 0_u64;
        let mut shift = 0;
        loop {
            let byte = *self.bytes.get(self.offset).ok_or(DecodeError("truncated varint"))?;
            self.offset += 1;
            if shift == 63 && byte > 1 {
                return Err(DecodeError("varint overflow"));
            }
            result |= u64::from(byte & 0x7f) << shift;
            if byte < 0x80 {
                return Ok(result);
            }
            shift += 7;
            if shift > 63 {
                return Err(DecodeError("varint too long"));
            }
        }
    }

    pub fn tag(&mut self) -> Result<(u64, u64)> {
        let tag = self.varint()?;
        Ok((tag >> 3, tag & 7))
    }

    pub fn bytes(&mut self) -> Result<&'a [u8]> {
        let length = usize::try_from(self.varint()?).map_err(|_| DecodeError("length overflow"))?;
        let end = self.offset.checked_add(length).ok_or(DecodeError("length overflow"))?;
        let slice = self.bytes.get(self.offset..end).ok_or(DecodeError("truncated field"))?;
        self.offset = end;
        Ok(slice)
    }

    pub fn fixed<const N: usize>(&mut self) -> Result<[u8; N]> {
        let end = self.offset.checked_add(N).ok_or(DecodeError("length overflow"))?;
        let slice = self.bytes.get(self.offset..end).ok_or(DecodeError("truncated fixed"))?;
        self.offset = end;
        slice.try_into().map_err(|_| DecodeError("truncated fixed"))
    }

    pub fn skip(&mut self, wire: u64) -> Result<()> {
        match wire {
            0 => {
                self.varint()?;
            }
            1 => {
                self.fixed::<8>()?;
            }
            2 => {
                self.bytes()?;
            }
            5 => {
                self.fixed::<4>()?;
            }
            _ => return Err(DecodeError("unsupported wire type")),
        }
        Ok(())
    }
}

pub fn zigzag(value: u64) -> i64 {
    ((value >> 1) as i64) ^ -((value & 1) as i64)
}

pub struct Packed<'a> {
    reader: Reader<'a>,
}

impl<'a> Packed<'a> {
    pub fn new(bytes: &'a [u8]) -> Self {
        Self { reader: Reader::new(bytes) }
    }
}

impl Iterator for Packed<'_> {
    type Item = Result<u64>;

    fn next(&mut self) -> Option<Self::Item> {
        if self.reader.done() {
            None
        } else {
            Some(self.reader.varint())
        }
    }
}
