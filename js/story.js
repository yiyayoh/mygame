// 剧本入口：把各章节的数据合并在一起。台词写法见 js/story/ch1.js 开头的说明。
import * as ch1 from './story/ch1.js';
import * as ch2 from './story/ch2.js';
import * as ch3 from './story/ch3.js';
import * as ch4 from './story/ch4.js';
import * as ch5 from './story/ch5.js';

export { CLUES, PROFILES } from './story/clues.js';

const chapters = [ch1, ch2, ch3, ch4, ch5];
export const START = 'prologue';
export const SCENES = Object.assign({}, ...chapters.map((c) => c.SCENES));
export const HUBS = Object.assign({}, ...chapters.map((c) => c.HUBS));
export const DEDUCTIONS = Object.assign({}, ...chapters.map((c) => c.DEDUCTIONS));

// 推理答错时搭档的吐槽（轮流出现）
export const WRONG_LINES = [
  '【宋小满】前辈……这好像对不上吧？',
  '【宋小满】唔，我觉得不是这个。',
  '【宋小满】再想想？这条和问题没什么关系。',
  '【宋小满】前辈，你是不是太累了……',
];
