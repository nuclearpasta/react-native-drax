# Contribution Guidelines

[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-v2.0%20adopted-ff69b4.svg)](CODE-OF-CONDUCT.md)

Thank you for considering contributing to Drax! Please note that this project is released with a [Contributor Code of Conduct](CODE-OF-CONDUCT.md). By participating in this project you agree to abide by its terms.

If you've found a bug, you're having trouble with the documentation, or you have a feature request, please open an issue with the relevant information.

If you're interested in making a non-trivial contribution, please first discuss the change you wish to make via GitHub issue, email, or any other method with the maintainers. We respect your time and energy, and we would like you to feel secure before expending significant effort.

Drax's code may appear complex, but project contributions can come in forms other than code commits! Anything that improves the quality of the library or helps its user community is a contribution. For example, enhancing the documentation, creating cool usage examples, and providing helpful input on issues are other ways to pitch in.

We understand how frustrating it can be to open an issue or pull request and not receive timely feedback. Please keep in mind that this project is maintained by volunteer effort, and we will do our best to reply promptly, according to our own capacity. For small PRs and simple issues, we'll try to reply within a few days to a week. Larger changes should be discussed in advance, as mentioned above, and they may take longer. Bug fixes and feature requests will be prioritized by gauging implementation difficulty and how widely applicable they are to the community, and they'll be addressed as availability allows.

## Development

The repo is a Yarn 4 workspace (the library at the root, plus `example/` and `docs-site/`). Use the Node version in `.nvmrc` and enable Corepack so the pinned Yarn version is used:

```bash
corepack enable
yarn install
```

Before opening a pull request, run the same checks CI runs:

```bash
yarn lint
yarn typecheck
yarn test
yarn prepare   # builds lib/ with react-native-builder-bob
```

To try changes in the example app (Expo Router), run `yarn example start`.

CI runs lint, typecheck, unit tests, the library build and a web export of the example app on every pull request. The unit tests (Jest) cover a small part of the library, so drag-and-drop behavior changes still need a manual check in the example app on a device or simulator, and larger changes may take longer to review. Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) and are checked by commitlint.