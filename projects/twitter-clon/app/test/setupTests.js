import { TextDecoder, TextEncoder } from 'node:util'
import '@testing-library/jest-dom'

globalThis.TextEncoder = TextEncoder
globalThis.TextDecoder = TextDecoder
