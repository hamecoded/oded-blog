import katex from 'katex';

export function renderMath(el: HTMLElement, latex: string, display: boolean) {
  katex.render(latex, el, { throwOnError: false, displayMode: display, output: 'htmlAndMathml' });
}
