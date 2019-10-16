import * as _ from 'lodash';
import { walkAddNodeTree, walkAddTree } from '../journalist';
import { CiqStoryNode, CiqStoryRawNode, CiqStoryTwist, createAttributesTwist, createChildListTwist, createEventTwist, createResizeTwist } from '../types';
import { isElement, isTextInput } from '../util';
import { ClickBubble } from './ClickBubble';
import { macCursorDataUri } from './mac-cursor';

const nodeIdToTextNode: Record<string, Node> = {};

const createIframe = () => {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('style', `
    border: 1px solid #333;
    position: absolute;
    top: 0;
    left: 0;
  `);
  iframe.setAttribute('width', '900');
  iframe.setAttribute('height', '800');
  iframe.setAttribute('sandbox', 'allow-same-origin');
  iframe.setAttribute('src', 'about:blank');
  return iframe;
};

const createPointer = () => {
  const pointer = document.createElement('div');
  pointer.setAttribute('style', `
    position: absolute;
    top: -20px;
    left: -20px;
  `);
  pointer.classList.add('story-teller-mouse-cursor');
  const pointerImg = document.createElement('img');
  pointerImg.setAttribute('style', `
    width: 15px;
    position: relative;
    top: -2px;
    left: -2px;
  `);
  pointerImg.src = macCursorDataUri;
  pointer.appendChild(pointerImg);
  return pointer;
};

function noNull<T>(thing: T | null): T | undefined {
  return thing === null ? undefined : thing;
}

function getNumberFromPx(px: string | null): number {
  return px != null ? parseFloat(px.replace('px', '')) : -1;
}

export class CiqStoryTeller {
  public container: HTMLElement;
  private iframe: HTMLIFrameElement;
  private idocument: Document;
  private pointer: HTMLElement;
  private storyIndex: number = 0;
  private twists: CiqStoryTwist[];
  private waitingOnNextFrame: boolean = false;
  private currentClickBubble?: ClickBubble;
  private nextFrameTimeoutId: number | undefined;
  private reverseTwistsById: Record<string, CiqStoryTwist | CiqStoryTwist[] | undefined> = {};
  constructor(private onPlayFrame: (frameIndex: number) => void) {
    this.container = document.createElement('div');
    this.container.setAttribute('style', `
      position: relative;
      overflow: hidden;
    `);
    this.container.classList.add('story-teller');
    this.iframe = createIframe();
    this.container.appendChild(this.iframe);
    this.pointer = createPointer();
    this.container.appendChild(this.pointer);
  }

  init() {
    const idocument = this.iframe.contentDocument;
    if (!idocument) {
      throw new Error('iframe had no content document, this is a problem');
    }
    this.idocument = idocument;
    idocument.open();
    idocument.write('<!DOCTYPE html>');
    idocument.write('<html>');
    idocument.write('<head></head>');
    idocument.write('<body>this is the iframe</body>');
    idocument.write('</html>');
    idocument.close();
    idocument.removeChild(idocument.childNodes[1]);
  }

  addTwists(twists: CiqStoryTwist[]) {
    this.setTwists([...this.twists, ...twists]);
  }

  setTwists(twists: CiqStoryTwist[]) {
    this.twists = _.sortBy([...twists], (t1) => {
      return t1.twistId;
    });
  }

  playNextStoryFrame() {
    // if we're already waiting on the timeout lets not set another, if we hit the end of the story we need to restart though
    if (this.waitingOnNextFrame) {
      return;
    }
    const thisTwist = this.twists[this.storyIndex];
    if (!thisTwist) {
      this.waitingOnNextFrame = false;
      return;
    }
    const lastTwist = this.twists[this.storyIndex - 1];
    const nextFrameDelay = Math.min(Math.ceil(thisTwist.timeSincePageLoad - (lastTwist && lastTwist.timeSincePageLoad || 0)), 1000);
    this.waitingOnNextFrame = true;
    this.nextFrameTimeoutId = window.setTimeout(() => {
      this.waitingOnNextFrame = false;
      this.playTwistSync(thisTwist);
      this.playNextStoryFrame();
    }, nextFrameDelay);
  }

  pauseStory() {
    if (this.nextFrameTimeoutId !== undefined) {
      window.clearTimeout(this.nextFrameTimeoutId);
      this.waitingOnNextFrame = false;
    }
  }

  setPlayHeadToIndex(index: number) {
    if (this.storyIndex === index) {
      return;
    }
    this.playSyncFromTo(this.storyIndex, index);
  }

  playSyncFromTo(from: number, to: number) {
    const reverse = from > to;
    from = reverse ? from - 1 : from; // if reversing the current index has already been reversed
    const indexes = [...Array(Math.abs(from - to + 1)).keys()].map((key) => key + Math.min(from, to));
    (reverse ? indexes.reverse() : indexes).forEach((index) => {
      this.storyIndex = index;
      const origTwist = this.twists[index];
      if (!origTwist) {
        throw new Error(`tried to play from ${from} to ${to} but no twist found for ${index}`);
      }
      const twist = reverse ? this.reverseTwistsById[origTwist.twistId] : origTwist;
      if (twist) {
        const twists = Array.isArray(twist) ? twist : [twist];
        twists.forEach((t) => this.playTwistSync(t, reverse));
      }
    });
  }

  playTwistSync = (twist: CiqStoryTwist, reverse: boolean = false) => {
    const targetDOMNode = twist.targetNode && this.findNodeByNodeId(twist.targetNode.nodeId);
    switch (twist.type) {
      case 'childList':
        let childReversals: CiqStoryTwist[] = [];

        if (twist.addedNodes) {
          if (!reverse) {
            childReversals =
              [createChildListTwist(twist.twistId,
                twist.targetNode,
                undefined,
                [...twist.addedNodes].reverse(),
              )];
          }
          if (!targetDOMNode) {
            console.warn('could not find targetNode for addition', JSON.stringify(twist.targetNode));
          } else {
            twist.addedNodes.forEach((storyNode: CiqStoryNode) => {

              const node = this.createNode(storyNode);
              if (node) {
                targetDOMNode.appendChild(node);
              } else if (storyNode.nodeType === 1 || storyNode.nodeType === 3) {
                throw new Error('couldnt make node for element or text node');
              }
            });
          }
        }
        if (twist.removedNodes) {
          if (!targetDOMNode) {
            console.log('could not find targetNode for removal', JSON.stringify(twist.targetNode));
          } else {
            const removeDOMNodes = _.compact(twist.removedNodes.map((storyNode: CiqStoryNode) => {
              let removeNode: Element | Document | Node | undefined;
              if (storyNode.nodeType === 3 || storyNode.nodeType === 8) {
                removeNode = this.findTextNode(storyNode, targetDOMNode);
                delete nodeIdToTextNode[storyNode.nodeId];
              } else {
                removeNode = this.findNodeByNodeId(storyNode.nodeId, targetDOMNode);
              }
              if (removeNode) {
                if (removeNode.parentNode !== targetDOMNode) {
                  console.log('removeNode isnt the child of the target at this point....', storyNode);
                  return;
                }

                targetDOMNode.removeChild(removeNode);
                return removeNode;
              }
              return;
            }));
            if (!reverse && removeDOMNodes.length) {
              const reverseAddTwists = walkAddNodeTree(removeDOMNodes.reverse(), targetDOMNode, { next: () => twist.twistId });
              childReversals = [...reverseAddTwists, ...childReversals,];

            }
          }
        }
        if (!reverse) {
          this.reverseTwistsById[twist.twistId] = childReversals;
        }
        break;
      case 'attributes':
        if (isElement(targetDOMNode)) {
          if (!reverse) {
            this.reverseTwistsById[twist.twistId] =
              createAttributesTwist(
                twist.twistId,
                twist.targetNode,
                twist.attributeName,
                noNull(targetDOMNode.getAttribute(twist.attributeName))
              );
          }
          targetDOMNode.setAttribute(twist.attributeName, twist.attributeValue || '');
        }
        break;
      case 'resize':
        if (!reverse) {
          this.reverseTwistsById[twist.twistId] =
            createResizeTwist(twist.twistId,
              getNumberFromPx(this.iframe.width),
              getNumberFromPx(this.iframe.height)
            );
        }
        this.container.style.width = (this.iframe.width = twist.width.toString()) + 'px';
        this.container.style.height = (this.iframe.height = twist.height.toString()) + 'px';
        break;
      case 'event':
        switch (twist.eventType) {
          case 'mousemove': {
            if (!reverse) {
              this.reverseTwistsById[twist.twistId] =
                createEventTwist(twist.twistId, twist.eventType,
                  undefined,
                  getNumberFromPx(this.pointer.style.top),
                  getNumberFromPx(this.pointer.style.left),
                );
            }
            const top = twist.clientY + 'px';
            const left = twist.clientX + 'px';
            this.pointer.style.top = top;
            this.pointer.style.left = left;
            if (this.currentClickBubble) {
              this.currentClickBubble.element.style.top = top;
              this.currentClickBubble.element.style.left = left;
            }
            break;
          }
          case 'mousedown': {
            this.pointer.classList.add('mousedown');
            const top = twist.clientY + 'px';
            const left = twist.clientX + 'px';
            this.currentClickBubble = new ClickBubble();
            this.currentClickBubble.element.style.top = top;
            this.currentClickBubble.element.style.left = left;
            this.container.appendChild(this.currentClickBubble.element);
            break;
          }
          case 'mouseup':
            this.pointer.classList.remove('mousedown');
            if (this.currentClickBubble) {
              this.currentClickBubble.up();
              this.currentClickBubble = undefined;
            }
            break;
          case 'input':
            if (isTextInput(targetDOMNode)) {
              if (!reverse) {
                this.reverseTwistsById[twist.twistId] =
                  createEventTwist(twist.twistId, twist.eventType,
                    twist.targetNode,
                    undefined, undefined,
                    targetDOMNode.value,
                  );
              }
              targetDOMNode.value = twist.textValue || '';
            }
            break;
        }
        break;
    }
    this.onPlayFrame(this.storyIndex);
    if (!reverse) {
      this.storyIndex++;
    }
  }

  createNode(storyNode: CiqStoryNode): Node | undefined {
    const nodeType = storyNode.nodeType;
    if (nodeType === 3 || nodeType === 8) {
      if (nodeIdToTextNode[storyNode.nodeId]) {
        return nodeIdToTextNode[storyNode.nodeId];
      }
      const textNode: CiqStoryRawNode = nodeType === 3 ?
        this.idocument.createTextNode(storyNode.nodeValue || '') :
        /// nodeType === 8
        this.idocument.createComment(storyNode.nodeValue || '');
      textNode.__ciqStoryNodeId = storyNode.nodeId;
      nodeIdToTextNode[storyNode.nodeId] = textNode;
      return textNode;
    }
    if (nodeType === 1) {
      let node = this.findNodeByNodeId(storyNode.nodeId);
      if (!node) {
        if (!storyNode.tagName) {
          throw new Error('got a story node of type 1, but not tag name, should be impossible');
        }
        const createdNode: HTMLElement & CiqStoryRawNode = this.idocument.createElement(storyNode.tagName);
        createdNode.setAttribute('siq-story-node-id', storyNode.nodeId);
        createdNode.__ciqStoryNodeId = storyNode.nodeId;
        const storyNodeAttrs = storyNode.attributes;
        if (storyNodeAttrs) {
          Object.keys(storyNodeAttrs).forEach((attributeName) => {
            if (attributeName === 'siqStoryCSS') {
              createdNode.innerHTML = storyNodeAttrs[attributeName];
            } else {
              try {
                createdNode.setAttribute(attributeName, storyNodeAttrs[attributeName]);
              } catch (e) {
                console.log('got weird attribute', attributeName, storyNodeAttrs[attributeName]);
              }
            }
          });
        }
        node = createdNode;
      }
      return node;
    }
    console.warn(`got story node with type ${nodeType} which we don't yet understand enough to render sollllyyy`);
    return undefined;
  }

  findTextNode(storyNode: CiqStoryNode, targetNode: Element | Document): Node | undefined {
    if (nodeIdToTextNode[storyNode.nodeId]) {
      return nodeIdToTextNode[storyNode.nodeId];
    }
    return undefined;
  }

  findNodeByNodeId(nodeId: string, ancestorNode?: Element | Document): Element | Document | undefined {

    if (nodeId === 'document') {
      return this.idocument;
    }
    if (nodeId === 'body') {
      return this.idocument.body;
    }
    if (nodeId !== undefined) {
      ancestorNode = ancestorNode || this.idocument;
      const foundNode = ancestorNode.querySelector('[siq-story-node-id="' + nodeId + '"]');
      return foundNode || undefined;
    }
    return undefined;
  }
}