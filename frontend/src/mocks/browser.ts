import { setupWorker } from "msw/browser";
import { attachmentHandlers } from "./handlers/attachments";
import { authHandlers } from "./handlers/auth";
import { coordinationHandlers } from "./handlers/coordination";
import { workspaceHandlers } from "./handlers/workspace";
import { resetMockData } from "./db";

export const worker = setupWorker(
  ...authHandlers,
  ...workspaceHandlers,
  ...coordinationHandlers,
  ...attachmentHandlers,
);

export async function startMocks() {
  await worker.start({
    // Non-API requests (Vite modules, fonts) go to the network untouched.
    onUnhandledFrame: "bypass",
    // MSW logs each intercepted request (headers included) by default.
    // Tokens must never reach the console.
    quiet: true,
  });
  // Dev convenience: run `teampulseResetMocks()` in the console to restore the seed.
  Object.assign(window, { teampulseResetMocks: resetMockData });
}
