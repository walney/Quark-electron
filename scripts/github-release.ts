import * as Octokit from '@octokit/rest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { getFilesToUpload } from './util';
import * as mime from 'mime-types';
import * as dotenv from 'dotenv';
import { printConsoleStatus } from 'print-console-status';
dotenv.config({ path: './dev-assets/prod.env' });

const octokit = new Octokit({
    auth: process.env.GITHUB_RELEASE
});

const packageJson = JSON.parse(fs.readFileSync('./package.json').toString());
const owner = 'Nishkalkashyap';
const repo = 'Quark-electron';
const tag_name = `v${packageJson.version}`;

const files = getFilesToUpload(packageJson.version, process.platform);
root()
    .then((res) => {
        printConsoleStatus(`Uploaded all files to github`, 'success');
    })
    .catch((err) => {
        console.error(err);
        throw Error(`Error uploading file`);
    });

async function root() {
    const currentReleaseExists = await getCurrentRelease();

    let release: Octokit.ReposListReleasesResponseItem[] | Octokit.ReposCreateReleaseResponse;
    if (currentReleaseExists) {
        release = currentReleaseExists;
    } else {
        release = (await createRelease()).data;
    }

    const url = release.upload_url;
    return await uploadAssets(url, release.id);
}

export async function listRelease() {
    return await octokit.repos.listReleases({
        owner,
        repo
    });
}

export async function updateRelease(params: Octokit.ReposUpdateReleaseParams) {
    return await octokit.repos.updateRelease(Object.assign({
        owner,
        repo
    }, params));
}

export async function getCurrentRelease() {
    const releases = await listRelease();
    const currentReleaseExists = releases.data.find((rel) => {
        return rel.tag_name == tag_name
    });
    return currentReleaseExists;
}

export async function getReleaseForVersion(version: string) {
    const releases = await listRelease();
    const versionRelease = releases.data.find((rel) => {
        return rel.tag_name == `v${version}`
    });
    return versionRelease;
}

export async function getAssetsForCurrentRelease(release_id: number) {
    const assets = await octokit.repos.listAssetsForRelease({
        owner,
        repo,
        release_id
    });
    return assets;
}

async function uploadAssets(url: string, release_id: number) {
    const assets = await octokit.repos.listAssetsForRelease({
        owner,
        repo,
        release_id
    });

    const promises = files.map(async (file) => {
        if (!fs.existsSync(file)) {
            return;
        }


        const name = path.basename(file);
        const exists = assets.data.find((val) => {
            return val.name == name;
        });

        if (exists) {
            await octokit.repos.deleteReleaseAsset({ owner, repo, asset_id: exists.id })
        }

        printConsoleStatus(`Uploading file: ${name}`, 'info');
        return await octokit.repos.uploadReleaseAsset({
            name,
            file: fs.readFileSync(file),
            url,
            headers: {
                "content-length": fs.statSync(file).size,
                "content-type": mime.lookup(file) as any
            }
        })
    });

    return Promise.all(promises);
}

async function createRelease() {
    return await octokit.repos.createRelease({
        owner,
        repo,
        tag_name,
        target_commitish: 'master',
        name: `Quark-${tag_name}`,
        draft: true,
        prerelease: true
    });
}