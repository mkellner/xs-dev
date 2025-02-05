import { print, filesystem, system } from 'gluegun'
import {
  INSTALL_PATH,
  INSTALL_DIR,
  EXPORTS_FILE_PATH,
  MODDABLE_REPO,
  getProfilePath,
} from './constants'
import upsert from '../patching/upsert'

export default async function (): Promise<void> {
  print.info('Setting up the mac tools!')

  const BIN_PATH = filesystem.resolve(
    INSTALL_PATH,
    'build',
    'bin',
    'mac',
    'release'
  )
  const BUILD_DIR = filesystem.resolve(
    INSTALL_PATH,
    'build',
    'makefiles',
    'mac'
  )

  const PROFILE_PATH = getProfilePath()

  // 0. ensure xcode command line tools are available (?)
  try {
    await system.exec('xcode-select -p')
  } catch (error) {
    print.error(
      'Xcode command line tools are required to build the SDK: https://developer.apple.com/xcode/'
    )
    process.exit(1)
  }

  const spinner = print.spin()
  spinner.start('Beginning setup...')

  // 1. clone moddable repo into ./local/share directory if it does not exist yet
  try {
    filesystem.dir(INSTALL_DIR)

    if (filesystem.exists(EXPORTS_FILE_PATH) === false) {
      filesystem.file(EXPORTS_FILE_PATH, {
        content: `# Generated by xs-dev CLI\n`,
      })
    }
  } catch (error) {
    spinner.fail(`Error setting up install directory: ${String(error)}`)
    process.exit(1)
  }

  if (filesystem.exists(INSTALL_PATH) !== false) {
    spinner.info('Moddable repo already installed')
  } else {
    try {
      spinner.start('Cloning Moddable-OpenSource/moddable repo')
      await system.spawn(`git clone ${MODDABLE_REPO} ${INSTALL_PATH}`)
      spinner.succeed()
    } catch (error) {
      spinner.fail(`Error cloning moddable repo: ${String(error)}`)
      process.exit(1)
    }
  }

  // 2. configure MODDABLE env variable, add release binaries dir to PATH
  process.env.MODDABLE = INSTALL_PATH
  process.env.PATH = `${String(process.env.PATH)}:${BIN_PATH}`

  await upsert(PROFILE_PATH, `source ${EXPORTS_FILE_PATH}`)

  await upsert(EXPORTS_FILE_PATH, `export MODDABLE=${process.env.MODDABLE}`)
  await upsert(EXPORTS_FILE_PATH, `export PATH="${BIN_PATH}:$PATH"`)

  // 3. cd into makefiles dir for platform, run `make`
  try {
    spinner.start('Building platform tooling')
    await system.exec('make', { cwd: BUILD_DIR })
    spinner.succeed()
  } catch (error) {
    spinner.fail(`Error building mac tooling: ${String(error)}`)
    process.exit(1)
  }

  // 4. symlink xsbug.app into user applications directory
  try {
    filesystem.symlink(
      filesystem.resolve(BIN_PATH, 'xsbug.app'),
      '/Applications/xsbug.app'
    )
  } catch (error) {
    if (!String(error).includes('exists')) {
      spinner.fail(`Issue creating symlink for xsbug.app: ${String(error)}`)
      process.exit(1)
    } else {
      spinner.info('xsbug.app symlink already exists')
    }
  }

  spinner.succeed(
    'Moddable SDK successfully set up! Start a new terminal session and run the "helloworld example": xs-dev run --example helloworld'
  )
}
