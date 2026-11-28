// gzip / deflate through the browser's CompressionStream.
// Fed and read through its own writer and reader, without Blob.stream(), pipeThrough() or
// Response: Firefox content scripts can fail to pass a stream between those.
export const transform = async (bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> => {
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();

  // Written and closed without waiting, so a large input can't stall waiting for its output to be read.
  const writing = writer.write(bytes as BufferSource).then(() => writer.close());
  writing.catch(() => undefined);

  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    const chunk = new Uint8Array(value);
    chunks.push(chunk);
    length += chunk.length;
  }
  await writing;

  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
};
