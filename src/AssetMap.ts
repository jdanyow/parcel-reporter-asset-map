import {Reporter} from "@parcel/plugin";
import {BundleBox} from "./BundleBox";
import path from "path";
import {AssetMap, Options} from "./types";
import {PluginOptions} from "@parcel/types";
import {EntryMapBuilder} from "./EntryMapBuilder";

export const MAP_FILENAME = 'asset-map.json';

function loadConfig(options: PluginOptions): Options {
    const raw = options.outputFS.readFileSync(path.join(options.projectRoot, "package.json"), 'utf-8');
    const packageJson = JSON.parse(raw);

    return {
        removeHTML: false,
        onlyRootChildren: true,
        groups: ['default'],
        ...packageJson['assetMap']
    };
}

export default new Reporter({
    async report({event, options}) {
        if (event.type !== "buildSuccess")
            return

        const config = loadConfig(options);

        const entryMapBuilder = new EntryMapBuilder(config, options);

        const map = new Map<string, Array<BundleBox>>();
        const {bundleGraph} = event;

        for (const bundle of bundleGraph.getBundles()) {
            const asset = BundleBox.getMainAsset(bundle);
            if (!asset) {
                continue;
            }

            if (!asset.isSource) {
                continue;
            }

            if (config.onlyRootChildren && bundleGraph.isAssetReferenced(bundle, asset)) {
                continue;
            }

            let bundles = map.get(bundle.target.distDir) ?? [];

            bundles.push(
                new BundleBox(
                    bundle,
                    asset,
                    bundleGraph,
                    bundleGraph.getReferencedBundles(bundle, {recursive: true})
                )
            );

            map.set(bundle.target.distDir, bundles);
        }

        for (const [targetDir, bundles] of map) {
            const assetMap: AssetMap = {assets: {}, entries: {}};

            for (const bundleBox of bundles) {

                const {asset} = bundleBox;
                const assetProjectPath = path.relative(options.projectRoot, asset.filePath);
                const targetPath = bundleBox.getTargetPath();
                const targetPublicPath = bundleBox.getTargetPublicPath();

                if (asset.type === 'html') {
                    const entryName = path.basename(asset.filePath, '.html');

                    assetMap.entries[entryName] = entryMapBuilder.build(bundleBox.children);

                    if (config.removeHTML)
                        options.outputFS.existsSync(targetPath)
                        && await options.outputFS.unlink(targetPath)

                    continue;
                }

                if (bundleBox.isExportedMultipleTimes()) {
                    if (!assetMap.assets[assetProjectPath]) {
                        assetMap.assets[assetProjectPath] = {};
                    }
                    assetMap.assets[assetProjectPath][bundleBox.getBrowserType()] = targetPublicPath;
                } else {
                    assetMap.assets[assetProjectPath] = targetPublicPath;
                }
            }

            const assetMapPath = 'dist/asset-map.json'; // path.relative(options.projectRoot, `${targetDir}/${MAP_FILENAME}`);
            console.log("jd", assetMapPath);
            await options.outputFS.writeFile(assetMapPath, JSON.stringify(assetMap, null, 2), null);

            console.log(`Asset map 🗺: ${assetMapPath}`);
        }
    }
})
