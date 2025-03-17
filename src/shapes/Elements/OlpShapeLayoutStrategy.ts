import type {
  LayoutStrategyResult,
  StrictLayoutContext,
} from '../../LayoutManager';
import { LayoutStrategy } from '../../LayoutManager';
import {
  LAYOUT_TYPE_IMPERATIVE,
  LAYOUT_TYPE_INITIALIZATION,
} from '../../LayoutManager/constants';
import { getObjectBounds } from '../../LayoutManager/LayoutStrategies/utils';
import { makeBoundingBoxFromPoints } from '../../util';
import type { FabricObject } from '../../shapes/Object/FabricObject';
import { Point } from '../../Point';

export class OlpShapeLayoutStrategy extends LayoutStrategy {
  static readonly type = 'olp-shape-strategy';
  calcBoundingBox(
    objects: FabricObject[],
    context: StrictLayoutContext,
  ): LayoutStrategyResult | undefined {
    const { type, target } = context;
    if (type === LAYOUT_TYPE_IMPERATIVE && context.overrides) {
      return context.overrides;
    }
    if (objects.length === 0) {
      return;
    }

    const { left, top, width, height } = makeBoundingBoxFromPoints(
      [objects[0]]
        .map((object) => getObjectBounds(target, object))
        .reduce<Point[]>((coords, curr) => coords.concat(curr), []),
    );
    const bboxSize = new Point(width, height);
    const bboxLeftTop = new Point(left, top);
    const bboxCenter = bboxLeftTop.add(bboxSize.scalarDivide(2));

    if (type === LAYOUT_TYPE_INITIALIZATION) {
      const actualSize = this.getInitialSize(context, {
        size: bboxSize,
        center: bboxCenter,
      });
      return {
        // in `initialization` we do not account for target's transformation matrix
        center: bboxCenter,
        // TODO: investigate if this is still necessary
        relativeCorrection: new Point(0, 0),
        size: actualSize,
      };
    } else {
      //  we send `relativeCenter` up to group's containing plane
      const center = bboxCenter.transform(target.calcOwnMatrix());
      return {
        center,
        size: bboxSize,
      };
    }
  }
}
