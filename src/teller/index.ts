import { CiqStoryNode, CiqStoryRawNode, CiqStoryTwist } from '../types';
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
  // clear it out cause it's easier to go from the root
  const idocument = iframe.contentDocument;
  iframe.setAttribute('width', '900');
  iframe.setAttribute('height', '800');
  iframe.setAttribute('sandbox', 'allow-same-origin');
  iframe.setAttribute('src', 'about:blank');
  if (!idocument) {
    throw new Error('iframe had no content document, this is a problem');
  }
  idocument.open();
  idocument.write('<!DOCTYPE html>');
  idocument.write('<html>');
  idocument.write('<head></head>');
  idocument.write('<body>this is the iframe</body>');
  idocument.write('</html>');
  idocument.close();
  idocument.removeChild(idocument.childNodes[1]);
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

export class CiqStoryTeller {
  public container: HTMLElement;
  private iframe: HTMLIFrameElement;
  private idocument: Document;
  private pointer: HTMLElement;
  private storyIndex: number = 0;
  private story: CiqStoryTwist[];
  private playing: boolean = false;
  private currentClickBubble?: ClickBubble;
  constructor() {
    this.container = document.createElement('div');
    this.container.setAttribute('style', `
      position: relative;
      overflow: hidden;
    `);
    this.container.classList.add('story-teller');
    this.iframe = createIframe();
    if (this.iframe.contentDocument == null) {
      throw new Error('iframe had no content document, this is a problem');
    }
    this.idocument = this.iframe.contentDocument;
    this.container.appendChild(this.iframe);
    this.pointer = createPointer();
    this.container.appendChild(this.pointer);
  }

  addTwists(twists: CiqStoryTwist[]) {
    this.story = [...this.story, ...twists];
  }

  setTwists(twists: CiqStoryTwist[]) {
    this.story = [...twists];
  }

  playNextStoryFrame() {
    // if we're already waiting on the timeout lets not set another, if we hit the end of the story we need to restart though
    if (this.playing) {
      return;
    }
    const thisTwist = this.story[this.storyIndex];
    if (!thisTwist) {
      this.playing = false;
      return;
    }
    const lastTwist = this.story[this.storyIndex - 1];
    const nextFrameDelay = Math.min(Math.ceil(thisTwist.timeSincePageLoad - (lastTwist && lastTwist.timeSincePageLoad || 0)), 1000);
    this.playing = true;
    setTimeout(() => {
      const twist = thisTwist;
      const targetNode = twist.targetNode && this.findNodeByNodeId(twist.targetNode.nodeId);
      switch (twist.type) {
        case 'childList':
          if (twist.addedNodes) {
            twist.addedNodes.forEach((storyNode: CiqStoryNode) => {
              if (!targetNode) {
                console.warn('could not find targetNode for addition', JSON.stringify(twist.targetNode));
                return;
              }
              const node = this.createNode(storyNode);
              if (node) {
                targetNode.appendChild(node);
              } else if (storyNode.nodeType === 1 || storyNode.nodeType === 3) {
                throw new Error('couldnt make node for element or text node');
              }
            });
          }
          if (twist.removedNodes) {
            twist.removedNodes.forEach((storyNode: CiqStoryNode) => {
              if (!targetNode) {
                console.log('could not find targetNode for removal', JSON.stringify(twist.targetNode));
                return;
              }
              let removeNode;
              if (storyNode.nodeType === 3 || storyNode.nodeType === 8) {
                removeNode = this.findTextNode(storyNode, targetNode);
                delete nodeIdToTextNode[storyNode.nodeId];
              } else {
                removeNode = this.findNodeByNodeId(storyNode.nodeId, targetNode);
              }
              if (removeNode) {
                if (removeNode.parentNode !== targetNode) {
                  console.log('removeNode isnt the child of the target at this point....', storyNode);
                  return;
                }
                targetNode.removeChild(removeNode);
              }

            });
          }
          break;
        case 'attributes':
          if (isElement(targetNode)) {
            targetNode.setAttribute(twist.attributeName, twist.attributeValue || '');
          }
          break;
        case 'resize':
          this.container.style.width = (this.iframe.width = twist.width.toString()) + 'px';
          this.container.style.height = (this.iframe.height = twist.height.toString()) + 'px';
          break;
        case 'event':
          switch (twist.eventType) {
            case 'mousemove': {
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
              if (isTextInput(targetNode)) {
                targetNode.value = twist.textValue || '';
              }
              break;
          }
          break;
      }
      this.storyIndex++;
      this.playNextStoryFrame();
    }, nextFrameDelay);
  }

  createNode(storyNode: CiqStoryNode): Node | undefined {
    const nodeType = storyNode.nodeType;
    if (nodeType === 3 || nodeType === 8) {
      if (nodeIdToTextNode[storyNode.nodeId]) {
        return nodeIdToTextNode[storyNode.nodeId];
      }
      let textNode: CiqStoryRawNode;
      switch (nodeType) {
        case 3:
          textNode = this.idocument.createTextNode(storyNode.nodeValue || '');
          break;
        case 8:
          textNode = this.idocument.createComment(storyNode.nodeValue || '');
          break;
        default:
          throw new Error(`its logically impossible to get here but ts doesn't know that`);
      }
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
        const createdNode = this.idocument.createElement(storyNode.tagName);
        createdNode.setAttribute('siq-story-node-id', storyNode.nodeId);
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