import {fixedNow} from './clock';

const RealDate = Date;

class FixedDate extends RealDate {
  static override now() {
    return fixedNow;
  }

  constructor(...arguments_: unknown[]) {
    if (arguments_.length === 0) {
      super(fixedNow);
    } else {
      super(...(arguments_ as [string]));
    }
  }
}

Object.defineProperty(globalThis, 'Date', {value: FixedDate});
