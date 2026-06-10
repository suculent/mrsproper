// Unit tests for phone pre-send validation using libphonenumber-js.
// Verifies that valid/invalid numbers are correctly classified before submitPhone.

import { describe, it, expect } from 'vitest'
import { isValidPhoneNumber } from 'libphonenumber-js/min'
import { formatCountdown } from './FloodCountdown'

describe('Phone pre-send validation (libphonenumber-js)', () => {
  it('accepts a valid US number', () => {
    // Use Google NYC number — 555 numbers are fictional in libphonenumber-js
    expect(isValidPhoneNumber('+12125551234', 'US')).toBe(true)
  })

  it('accepts a valid Czech number', () => {
    expect(isValidPhoneNumber('+420601234567', 'CZ')).toBe(true)
  })

  it('rejects too-short national segment', () => {
    expect(isValidPhoneNumber('+1555', 'US')).toBe(false)
  })

  it('rejects an all-zeros number', () => {
    expect(isValidPhoneNumber('+10000000000', 'US')).toBe(false)
  })

  it('rejects a non-numeric string', () => {
    expect(isValidPhoneNumber('abcdefg', 'US')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isValidPhoneNumber('', 'US')).toBe(false)
  })
})

describe('FloodCountdown formatCountdown', () => {
  it('formats 0 seconds as 00:00', () => {
    expect(formatCountdown(0)).toBe('00:00')
  })

  it('formats 59 seconds as 00:59', () => {
    expect(formatCountdown(59)).toBe('00:59')
  })

  it('formats 60 seconds as 01:00', () => {
    expect(formatCountdown(60)).toBe('01:00')
  })

  it('formats 125 seconds as 02:05', () => {
    expect(formatCountdown(125)).toBe('02:05')
  })

  it('clamps negative values to 00:00', () => {
    expect(formatCountdown(-5)).toBe('00:00')
  })

  it('handles fractional seconds by flooring', () => {
    expect(formatCountdown(61.9)).toBe('01:01')
  })
})
