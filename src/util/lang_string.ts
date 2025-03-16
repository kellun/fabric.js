/**
 * Capitalizes a string
 * @param {String} string String to capitalize
 * @param {Boolean} [firstLetterOnly] If true only first letter is capitalized
 * and other letters stay untouched, if false first letter is capitalized
 * and other letters are converted to lowercase.
 * @return {String} Capitalized version of a string
 */
export const capitalize = (string: string, firstLetterOnly = false): string =>
  `${string.charAt(0).toUpperCase()}${
    firstLetterOnly ? string.slice(1) : string.slice(1).toLowerCase()
  }`;

/**
 * Escapes XML in a string
 * @param {String} string String to escape
 * @return {String} Escaped version of a string
 */
export const escapeXml = (string: string): string =>
  string
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/**
 * Divide a string in the user perceived single units
 * @param {String} textstring String to split into graphemes
 * @return {Array} array containing the graphemes
 */
export const graphemeSplit = (textstring: string): string[] => {
  // 用于存储分割后的字形单元
  const graphemes = [];
  // 遍历字符串中的每个字符
  for (let i = 0, chr; i < textstring.length; i++) {
    // 获取当前位置的完整字符
    if ((chr = getWholeChar(textstring, i)) === false) {
      // 如果是低代理项，则跳过
      continue;
    }
    // 将完整字符添加到字形数组中
    graphemes.push(chr as string);
  }
  // 返回包含所有字形的数组
  return graphemes;
};

// taken from mdn in the charAt doc page.
/**
 * 获取字符串中指定位置的完整字符。
 * 如果该位置是一个代理对的一部分，则返回整个代理对；否则返回该位置的单个字符。
 * 如果该位置是低代理项，则返回 false。
 *
 * @param {string} str - 要从中获取字符的字符串。
 * @param {number} i - 要获取字符的位置。
 * @returns {string | boolean} - 如果找到完整字符，则返回该字符；如果是低代理项，则返回 false；如果位置无效，则返回空字符串。
 * @throws {string} - 如果遇到孤立的高代理项或低代理项，则抛出错误。
 */
const getWholeChar = (str: string, i: number): string | boolean => {
  // 获取指定位置的字符编码
  const code = str.charCodeAt(i);
  // 检查该位置是否存在字符
  if (isNaN(code)) {
    return ''; // 位置未找到
  }
  // 检查该字符是否不是代理对的一部分
  if (code < 0xd800 || code > 0xdfff) {
    return str.charAt(i);
  }

  // 高代理项 (可以将最后一个十六进制改为 0xDB7F 以将高私有代理项视为单个字符)
  if (0xd800 <= code && code <= 0xdbff) {
    // 检查是否有后续的低代理项
    if (str.length <= i + 1) {
      throw 'High surrogate without following low surrogate';
    }
    // 获取下一个字符的编码
    const next = str.charCodeAt(i + 1);
    // 检查下一个字符是否为有效的低代理项
    if (0xdc00 > next || next > 0xdfff) {
      throw 'High surrogate without following low surrogate';
    }
    // 返回高代理项和低代理项组成的字符串
    return str.charAt(i) + str.charAt(i + 1);
  }
  // 低代理项 (0xDC00 <= code && code <= 0xDFFF)
  if (i === 0) {
    throw 'Low surrogate without preceding high surrogate';
  }
  // 获取前一个字符的编码
  const prev = str.charCodeAt(i - 1);

  // (可以将最后一个十六进制改为 0xDB7F 以将高私有代理项视为单个字符)
  // 检查前一个字符是否为有效的高代理项
  if (0xd800 > prev || prev > 0xdbff) {
    throw 'Low surrogate without preceding high surrogate';
  }
  // 现在可以跳过低代理项，因为它是我们已经处理过的一对中的第二个组件
  return false;
};
