import { open } from "node:fs/promises";

/** Read a bounded file range; cancellation may arrive while a disk read is pending. */
export async function fileByteStream(file: string, start: number, end: number) {
  const handle = await open(file, "r");
  let position = start;
  let cancelled = false;
  let closed: Promise<void> | undefined;
  const close = () => closed ??= handle.close();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const buffer = Buffer.alloc(Math.min(64 * 1024, end - position + 1));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
        if (cancelled) return;
        if (bytesRead) {
          position += bytesRead;
          controller.enqueue(buffer.subarray(0, bytesRead));
        }
        if (!bytesRead || position > end) {
          // No await between checking cancellation and closing the controller.
          controller.close();
          await close().catch(() => {});
        }
      } catch (error) {
        if (!cancelled) controller.error(error);
        await close().catch(() => {});
      }
    },
    async cancel() {
      cancelled = true;
      await close().catch(() => {});
    },
  });
}
