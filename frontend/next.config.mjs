import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js'

/** @type {(phase: string) => import('next').NextConfig} */
export default function nextConfig(phase) {
  return {
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev-cache' : '.next',
    transpilePackages: ['tldraw'],
  }
}
