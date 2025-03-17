import type { TClassProperties, TOptions } from '../../typedefs';
import type { ITextEvents } from '../IText/ITextBehavior';
import { Textbox } from '../Textbox';
import type { SerializedTextboxProps, TextboxProps } from '../Textbox';

export const olptextboxDefaultValues: Partial<TClassProperties<OlpTextbox>> = {
  wrap: true,
  fit: 'none',
};
export interface UniqueOlpTextboxProps {
  wrap: boolean;
  fit: 'none' | 'resize' | 'shrink';
}
export interface SerializedOlpTextboxProps
  extends SerializedTextboxProps,
    Pick<UniqueOlpTextboxProps, 'wrap' | 'fit'> {}

export interface OlpTextboxProps extends TextboxProps, UniqueOlpTextboxProps {}

export class OlpTextbox<
  Props extends TOptions<OlpTextboxProps> = Partial<OlpTextboxProps>,
  SProps extends SerializedTextboxProps = SerializedTextboxProps,
  EventSpec extends ITextEvents = ITextEvents,
> extends Textbox<Props, SProps, EventSpec> {
  /**
   * 形状中文字自动换行
   */
  declare wrap: boolean;

  /**
   * none: 不自动调整形状大小
   * resize: 根据文本宽度自动调整形状大小
   * shrink: 溢出时缩小文字
   */
  declare fit: 'none' | 'resize' | 'shrink';

  static ownDefaults = olptextboxDefaultValues;

  static type = 'OlpTextbox';

  static getDefaults(): Record<string, any> {
    return {
      ...super.getDefaults(),
      ...OlpTextbox.ownDefaults,
    };
  }

  constructor(text: string, options?: Props) {
    super(text, { ...OlpTextbox.ownDefaults, ...options } as Props);
  }
}
