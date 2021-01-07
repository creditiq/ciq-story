export const valueOrUndefined = <T>(t: T | null | undefined) => (t != null ? t : undefined);

export function isElement(node: Node | Element | Document | undefined): node is Element {
  return node != undefined && (node as Element).attributes != undefined;
}

export function isTextInput(node: Node | Element | Document | undefined): node is HTMLInputElement {
  return node != undefined && (node as HTMLInputElement).value !== undefined;
}

export function isHtmlElement(node: Node | Element | Document | undefined): node is HTMLElement {
  return node != undefined && (node as HTMLElement).innerHTML !== undefined;
}

export function isPromise<T>(p: Promise<T> | T): p is Promise<T> {
  return !!p && (p as any).then !== undefined;
}
