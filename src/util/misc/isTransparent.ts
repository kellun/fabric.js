/**
 * 判断指定位置的像素是否透明（考虑容差）
 * @param {CanvasRenderingContext2D} ctx 画布上下文
 * @param {Number} x x坐标（画布元素坐标系，非fabric空间，整数）
 * @param {Number} y y坐标（画布元素坐标系，非fabric空间，整数）
 * @param {Number} tolerance 容差范围（像素数，非透明度容差，整数）
 * @return {boolean} 如果透明则返回true，否则返回false
 */
export const isTransparent = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tolerance: number,
): boolean => {
  tolerance = Math.round(tolerance); // 四舍五入容差值
  const size = tolerance * 2 + 1; // 计算需要检查的区域大小
  const { data } = ctx.getImageData(x - tolerance, y - tolerance, size, size); // 获取指定区域的图像数据

  // 遍历图像数据 - 对于容差 > 1 的情况，每个像素数据大小为4
  for (let i = 3; i < data.length; i += 4) {
    const alphaChannel = data[i]; // 获取当前像素的alpha通道值
    if (alphaChannel > 0) {
      return false; // 如果发现不透明的像素，返回false
    }
  }
  return true; // 所有像素都透明，返回true
};
