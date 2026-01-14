const origExit = process.exit;
process.exit = (code) => {
  console.error("[EXIT-TRAP] process.exit called with:", code, new Error("exit stack").stack);
  return origExit(code);
};
process.on("exit", (code) => console.error("[EXIT-TRAP] process exit event:", code));
process.on("beforeExit", (code) => console.error("[EXIT-TRAP] beforeExit:", code));
process.on("unhandledRejection", (r) => console.error("[EXIT-TRAP] unhandledRejection:", r));
process.on("uncaughtException", (e) => console.error("[EXIT-TRAP] uncaughtException:", e));
