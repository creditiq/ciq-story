
import * as _ from 'lodash';

export class ClickBubble {
  downtime: number;
  element: HTMLElement;
  baseStyle: string;
  cancelingTimeout: number;
  constructor() {
    this.downtime = Date.now();
    this.element = document.createElement('div');

    const clickDiameter = 20;
    const clickDiameterHalfNeg = -1 * clickDiameter / 2;
    const clickColor = 'rgba(0, 0, 0, 0.3)';
    // tslint:disable:max-line-length
    const clickTransitionLength = '.1s';
    this.baseStyle = `
      transition: width ${clickTransitionLength}, height ${clickTransitionLength}, top ${clickTransitionLength}, left ${clickTransitionLength}, background-color ${clickTransitionLength}, margin ${clickTransitionLength};
      position: absolute;
      border-radius: 50%;
    `;
    // tslint:enable:max-line-length
    this.element.setAttribute('style', this.baseStyle);

    this.setUpStyle();
    this.element.classList.add('click-bubble');
    setTimeout(() => {
      this.element.classList.add('down');
      this.setStyles({
        backgroundColor: `${clickColor}`,
        marginTop: `${clickDiameterHalfNeg}px`,
        marginLeft: `${clickDiameterHalfNeg}px`,
        width: `${clickDiameter}px`,
        height: `${clickDiameter}px`,
        boxShadow: `0px 0px 5px 1px ${clickColor}`,
      });
    });
    this.cancelingTimeout = window.setTimeout(this.doUp, 5000);
  }

  setStyles = (styles: Partial<Record<keyof CSSStyleDeclaration, string>>) => {
    _.forEach(styles, (value, name: any) => this.element.style[name] = value!);
  }

  up() {
    setTimeout(this.doUp, Math.max(100 - (Date.now() - this.downtime), 0));
  }

  private doUp = () => {
    this.element.classList.remove('down');
    this.setUpStyle();
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }

  private setUpStyle() {
    this.setStyles({
      width: '0',
      height: '0',
    });
  }

}