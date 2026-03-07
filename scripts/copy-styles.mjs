import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const projectRoot = resolve(__dirname, '..')
const sourceFile = resolve(projectRoot, 'src/components/PartnerDashboard/styles.css')
const targetFile = resolve(projectRoot, 'dist/styles.css')

if (!existsSync(sourceFile)) {
  throw new Error(`Source stylesheet not found: ${sourceFile}`)
}

mkdirSync(dirname(targetFile), { recursive: true })
copyFileSync(sourceFile, targetFile)

console.log(`Copied stylesheet: ${sourceFile} -> ${targetFile}`)
