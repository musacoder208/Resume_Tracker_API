declare module 'libreoffice-convert' {
  export function convert(
    inputBuffer: Buffer,
    outputFormat: string,
    filter: string | undefined,
    callback: (err: Error | null, result: Buffer) => void
  ): void
}
