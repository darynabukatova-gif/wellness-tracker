'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const E2E_MODE_VARIABLE = 'WELLNESS_TRACKER_E2E';
const E2E_USER_DATA_VARIABLE = 'WELLNESS_TRACKER_E2E_USER_DATA_DIR';
const E2E_DIRECTORY_PREFIX = 'wellness-tracker-e2e-';

function invalidConfiguration(message) {
  const error = new Error(message);
  error.code = 'INVALID_E2E_CONFIGURATION';
  return error;
}

function resolveE2EUserDataConfiguration({
  environment = process.env,
  temporaryDirectory = os.tmpdir(),
  productionUserDataDirectory,
  fileSystem = fs,
} = {}) {
  const mode = environment[E2E_MODE_VARIABLE];
  const requestedDirectory = environment[E2E_USER_DATA_VARIABLE];
  const hasModeVariable = mode !== undefined;
  const hasDirectoryVariable = requestedDirectory !== undefined;

  if (!hasModeVariable && !hasDirectoryVariable) {
    return { mode: 'production' };
  }

  if (mode !== '1' || typeof requestedDirectory !== 'string' || requestedDirectory.length === 0) {
    throw invalidConfiguration(
      'E2E mode requires WELLNESS_TRACKER_E2E=1 and WELLNESS_TRACKER_E2E_USER_DATA_DIR.'
    );
  }

  if (!path.isAbsolute(requestedDirectory)) {
    throw invalidConfiguration('The E2E userData directory must be an absolute path.');
  }

  let temporaryRoot;
  let directoryStatus;
  let realDirectory;
  try {
    temporaryRoot = fileSystem.realpathSync(temporaryDirectory);
    directoryStatus = fileSystem.lstatSync(requestedDirectory);
    realDirectory = fileSystem.realpathSync(requestedDirectory);
  } catch (error) {
    throw invalidConfiguration('The E2E userData directory must be an existing directory.');
  }

  if (!directoryStatus.isDirectory() || directoryStatus.isSymbolicLink()) {
    throw invalidConfiguration('The E2E userData directory must be a non-symlink directory.');
  }

  if (path.dirname(realDirectory) !== temporaryRoot ||
      !path.basename(realDirectory).startsWith(E2E_DIRECTORY_PREFIX)) {
    throw invalidConfiguration(
      `The E2E userData directory must be a direct ${E2E_DIRECTORY_PREFIX} child of the system temporary directory.`
    );
  }

  if (typeof productionUserDataDirectory === 'string' && productionUserDataDirectory.length > 0) {
    let realProductionDirectory;
    try {
      realProductionDirectory = fileSystem.realpathSync(productionUserDataDirectory);
    } catch (error) {
      realProductionDirectory = path.resolve(productionUserDataDirectory);
    }

    if (realDirectory === realProductionDirectory) {
      throw invalidConfiguration('The E2E userData directory must not be the production userData directory.');
    }
  }

  return { mode: 'e2e', userDataDirectory: realDirectory };
}

function configureE2EUserData({ app, environment, temporaryDirectory, productionUserDataDirectory, fileSystem } = {}) {
  if (!app || typeof app.setPath !== 'function') {
    throw new TypeError('An Electron app with setPath() is required.');
  }

  const configuration = resolveE2EUserDataConfiguration({
    environment,
    temporaryDirectory,
    productionUserDataDirectory,
    fileSystem,
  });

  if (configuration.mode === 'e2e') {
    app.setPath('userData', configuration.userDataDirectory);
  }

  return configuration;
}

module.exports = {
  E2E_MODE_VARIABLE,
  E2E_USER_DATA_VARIABLE,
  E2E_DIRECTORY_PREFIX,
  configureE2EUserData,
  resolveE2EUserDataConfiguration,
};
