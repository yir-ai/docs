import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const docsRoot = path.resolve(scriptDirectory, '..')
const sourceDirectory = process.argv[2]
if (!sourceDirectory) {
  throw new Error('Usage: pnpm sync:openapi <directory containing reviewed standard-openapi.json and standard-model-contracts.json>')
}
const source = path.resolve(sourceDirectory, 'standard-openapi.json')
const destinationDirectory = path.join(docsRoot, 'openapi')
const destination = path.join(destinationDirectory, 'gateway-openapi.json')
const modelContractsSource = path.resolve(
  sourceDirectory,
  'standard-model-contracts.json',
)
const modelContractsDestination = path.join(
  destinationDirectory,
  'model-contracts.json',
)
const referenceDestination = path.join(
  destinationDirectory,
  'gateway-openapi.reference.json',
)

const reviewedOperations = new Map([
  ['/v1/images/quotes', new Set(['post'])],
  ['/v1/images/generations', new Set(['post'])],
  ['/v1/videos/quotes', new Set(['post'])],
  ['/v1/videos/generations', new Set(['post'])],
  ['/v1/files', new Set(['post'])],
  ['/v1/files/{id}/complete', new Set(['post'])],
  ['/v1/files/{id}', new Set(['get'])],
  ['/v1/files/{id}/content', new Set(['get'])],
  ['/v1/models/{creator}/{model}', new Set(['get'])],
  ['/v1/jobs/{id}', new Set(['get'])],
  ['/v1/jobs/{id}/cancel', new Set(['post'])],
])

await mkdir(destinationDirectory, { recursive: true })
await Promise.all([
  copyFile(source, destination),
  copyFile(modelContractsSource, modelContractsDestination),
])

const reference = JSON.parse(await readFile(destination, 'utf8'))
reference.paths = Object.fromEntries(
  Object.entries(reference.paths ?? {}).flatMap(([route, pathItem]) => {
    const methods = reviewedOperations.get(route)
    if (!methods) return []
    return [
      [
        route,
        Object.fromEntries(
          Object.entries(pathItem).filter(
            ([key]) =>
              !['get', 'post', 'put', 'patch', 'delete'].includes(key) ||
              methods.has(key),
          ),
        ),
      ],
    ]
  }),
)
await writeFile(
  referenceDestination,
  `${JSON.stringify(reference, null, 2)}\n`,
  'utf8',
)

console.log(
  'Synchronized reviewed Standard OpenAPI, static model contracts, and Blume reference projection into yir-docs.',
)
