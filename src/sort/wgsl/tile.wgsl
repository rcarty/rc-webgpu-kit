// each 256-thread workgroup does ITEMS rounds of 256 keys
const ITEMS = 4u;
const TILE = 1024u;

struct P {
  n: u32,
  shift: u32,
  numTiles: u32,
}
