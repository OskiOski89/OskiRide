export const ZWIFT_SERVICE = '00000001-19ca-4651-86e5-fa29dcdd09d1';
export const ZWIFT_NOTIFICATIONS = '00000002-19ca-4651-86e5-fa29dcdd09d1';
export const ZWIFT_WRITE = '00000003-19ca-4651-86e5-fa29dcdd09d1';
export const ZWIFT_INDICATIONS = '00000004-19ca-4651-86e5-fa29dcdd09d1';
export const BATTERY_SERVICE = 0x180f;
export const BATTERY_LEVEL = 0x2a19;

const MODELS = {
  'click-v2': { manufacturerCode: 0x0a },
  'click-v2-left': { manufacturerCode: 0x0b },
  'click-v1': { manufacturerCode: 0x09, namePrefixes: ['ZwiftClick', 'Zwift Click'] },
};

function manufacturerFilter(code) {
  return { manufacturerData: [{ companyIdentifier: 0x094a, dataPrefix: Uint8Array.of(code) }] };
}

export function zwiftRequestOptions(model) {
  if (!Object.hasOwn(MODELS, model)) throw new TypeError('Unsupported Zwift Click model.');
  const { manufacturerCode, namePrefixes = [] } = MODELS[model];
  const options = {
    filters: [manufacturerFilter(manufacturerCode), ...namePrefixes.map(namePrefix => ({ namePrefix }))],
    optionalServices: [ZWIFT_SERVICE, BATTERY_SERVICE],
  };
  if (model === 'click-v1') {
    options.exclusionFilters = [manufacturerFilter(0x0a), manufacturerFilter(0x0b)];
  }
  return options;
}

export function zwiftHandshake(model) {
  const ending = model === 'click-v2' || model === 'click-v2-left' ? [0x02, 0x03] : [];
  return Uint8Array.of(0x52, 0x69, 0x64, 0x65, 0x4f, 0x6e, ...ending);
}

const CLICK_V2_BUTTONS = {
  'click-v2': { plus: 0x1000, a: 0x0010, b: 0x0020, y: 0x0040, z: 0x0080 },
  'click-v2-left': { minus: 0x0100, left: 0x0001, up: 0x0002, right: 0x0004, down: 0x0008 },
};

function uint32(frame, cursor) {
  let value = 0;
  for (let shift = 0; shift <= 28 && cursor.offset < frame.byteLength; shift += 7) {
    const byte = frame.getUint8(cursor.offset++);
    value += (byte & 0x7f) * 2 ** shift;
    if (byte < 0x80) return value <= 0xffffffff ? value : undefined;
  }
  return undefined;
}

function readFields(frame) {
  const fields = new Map();
  const cursor = { offset: 1 };
  while (cursor.offset < frame.byteLength) {
    const tag = uint32(frame, cursor);
    if (!tag || tag < 8) return null;
    const field = tag >>> 3;
    const wireType = tag & 7;
    if (wireType === 0) {
      const value = uint32(frame, cursor);
      if (value === undefined) return null;
      fields.set(field, value);
    } else if (wireType === 2) {
      const size = uint32(frame, cursor);
      if (size === undefined) return null;
      cursor.offset += size;
    } else if (wireType === 1 || wireType === 5) {
      cursor.offset += wireType === 1 ? 8 : 4;
    } else {
      return null;
    }
    if (cursor.offset > frame.byteLength) return null;
  }
  return fields;
}

function bitmapButtons(bitmap, masks) {
  return Object.keys(masks).filter(button => (bitmap & masks[button]) === 0);
}

export function decodeZwiftButtons(model, frame) {
  if (!frame?.byteLength) return null;
  const opcode = frame.getUint8(0);
  if (model === 'click-v1') {
    if (frame.byteLength === 1 && opcode <= 3) {
      return ['plus', 'minus'].filter((_, index) => opcode & (1 << index));
    }
    if (opcode !== 0x37) return null;
    const fields = readFields(frame);
    const values = [fields?.get(1), fields?.get(2)];
    if (values.some(value => value !== 0 && value !== 1)) return null;
    return ['plus', 'minus'].filter((_, index) => values[index] === 0);
  }
  if (opcode !== 0x23 || !Object.hasOwn(CLICK_V2_BUTTONS, model)) return null;
  const bitmap = readFields(frame)?.get(1);
  return bitmap === undefined ? null : bitmapButtons(bitmap, CLICK_V2_BUTTONS[model]);
}

export function decodeZwiftBattery(frame) {
  if (!frame?.byteLength || frame.getUint8(0) !== 0x19) return null;
  const percentage = readFields(frame)?.get(2);
  return percentage <= 100 ? percentage : null;
}

export function isZwiftActivationNotice(frame) {
  return frame.byteLength === 5 && frame.getUint8(0) === 0xff && frame.getUint8(1) === 0x05 &&
    frame.getUint8(2) === 0 && (frame.getUint8(3) === 0xea || frame.getUint8(3) === 0xfa) && frame.getUint8(4) === 0x05;
}
