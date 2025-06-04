import { classRegistry } from '../../ClassRegistry';
import type { TClassProperties, TOptions } from '../../typedefs';
import { Group, type GroupProps } from '../Group';

export const olpTableCellDefaultValues: Partial<
  TClassProperties<OlpTableCell>
> = {};

export interface UniqueOlpTableCellProps {}

export interface OlpTableCellProps
  extends GroupProps,
    UniqueOlpTableCellProps {}

export class OlpTableCell<
    Props extends TOptions<OlpTableCellProps> = Partial<OlpTableCellProps>,
  >
  extends Group
  implements OlpTableCellProps
{
  static ownDefaults = olpTableCellDefaultValues;
  static getDefaults(): Record<string, any> {
    return { ...super.getDefaults(), ...OlpTableCell.ownDefaults };
  }

  /**
   * Constructor
   * @param {Object} [options] Options object
   */
  constructor(options?: Props) {
    super();
    Object.assign(this, OlpTableCell.ownDefaults);
    this.setOptions(options);
  }

  /**
   * @private
   * @param {CanvasRenderingContext2D} ctx Context to render on
   */
  _render(ctx: CanvasRenderingContext2D) {}
}
classRegistry.setClass(OlpTableCell);
classRegistry.setSVGClass(OlpTableCell);
