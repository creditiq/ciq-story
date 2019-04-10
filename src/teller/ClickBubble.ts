
export class ClickBubble {
  downtime: number;
  element: HTMLElement;
  baseStyle: string;
  constructor() {
    this.downtime = Date.now();
    this.element = document.createElement('div');

    const clickDiameter = 20;
    const clickDiameterHalfNeg = -1 * clickDiameter / 2;
    const clickColor = 'rgba(0, 0, 0, 0.3)';
    // tslint:disable:max-line-length
    const clickTransitionLength = '.1s';
    this.baseStyle = `
      transition: width ${clickTransitionLength}, height ${clickTransitionLength}, top ${clickTransitionLength}, left ${clickTransitionLength}, background-color ${clickTransitionLength}, margin ${clickTransitionLength}
    `;
    // tslint:enable:max-line-length
    this.element.setAttribute('style', this.baseStyle);

    this.setUpStyle();
    this.element.classList.add('click-bubble');
    setTimeout(() => {
      this.element.classList.add('down');
      this.element.setAttribute('style', `
        ${this.baseStyle}
        background-color: ${clickColor};
        margin-top: ${clickDiameterHalfNeg}px;
        margin-left: ${clickDiameterHalfNeg}px;
        width: ${clickDiameter}px;
        height: ${clickDiameter}px;
        box-shadow: 0px 0px 5px 1px ${clickColor};
      `);
    });
  }

  up() {
    setTimeout(() => {
      this.element.classList.remove('down');
      this.setUpStyle();
      if (this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
    }, Math.max(100 - (Date.now() - this.downtime), 0));
  }

  private setUpStyle() {
    this.element.setAttribute('style', `
      ${this.baseStyle}
      position: absolute;
      width: 0;
      height: 0;
      border - radius: 50 %;
    `);
  }

}