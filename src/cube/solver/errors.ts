/** The cube state cannot be reached by turning a real cube (bad input). */
export class UnsolvableCubeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsolvableCubeError'
  }
}
