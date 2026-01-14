if (typeof window !== "undefined") {
  const patchedWindow = window as typeof window & { __chartsProPatchedRemoveChild?: boolean };
  if (!patchedWindow.__chartsProPatchedRemoveChild) {
    const patchPrototype = (proto: Pick<Node, "removeChild"> | undefined) => {
      if (!proto || typeof proto.removeChild !== "function") return;
      const original = proto.removeChild;
      proto.removeChild = function patchedRemoveChild<T extends Node>(child: T): T {
        if (!child) return child;
        try {
          return original.call(this, child);
        } catch (error) {
          if (error instanceof DOMException && error.name === "NotFoundError") {
            return child;
          }
          throw error;
        }
      };
    };
    patchPrototype(Node.prototype);
    if (typeof Element !== "undefined") {
      patchPrototype(Element.prototype);
    }
    patchedWindow.__chartsProPatchedRemoveChild = true;
  }
}
