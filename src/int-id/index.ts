export class IntId {
  private count: number = 1;
  next() {
    return ++this.count;
  }
}