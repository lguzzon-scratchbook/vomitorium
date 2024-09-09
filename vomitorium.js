#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { program } from "commander";
import { cosmiconfigSync } from "cosmiconfig";

const config = getConfig();

program
	.option(
		"--scan <dir>",
		"Directory to scan. Defaults to current working directory",
		config.scan,
	)
	.option(
		"--include <dirs>",
		"Comma-separated list of directories to include",
		(value) => value.split(","),
	)
	.option(
		"--exclude <patterns>",
		"Comma-separated list of directories or files to exclude",
		(value) => value.split(","),
	)
	.option(
		"--extensions <exts>",
		"Comma-separated list of file extensions to include",
		(value) => value.split(","),
	)
	.option(
		"--show-excluded",
		"Show excluded files in the output",
		config.showExcluded,
	)
	.option(
		"--show-skipped",
		"Show skipped files without listing their contents",
		config.showSkipped,
	)
	.option("--output <file>", "Specify the output file name", config.outputFile);

program.parse(process.argv);

const options = program.opts();
const inputDirectory = options.scan || config.scan;
const includeDirectories = options.include || config.include;
const excludePatterns = options.exclude || config.exclude;
const includeExtensions = options.extensions || config.extensions;
const showExcluded =
	options.showExcluded === undefined
		? config.showExcluded
		: options.showExcluded;
const showSkipped =
	options.showSkipped === undefined ? config.showSkipped : options.showSkipped;
const outputFile = options.output || config.outputFile;

async function main() {
	const outputFilePath = path.join(process.cwd(), outputFile);

	try {
		await fs.access(inputDirectory);
	} catch {
		console.error(
			`Error: Directory "${inputDirectory}" does not exist or is inaccessible.`,
		);
		process.exit(1);
	}

	await fs.writeFile(outputFilePath, "");

	console.log(`Traversing directory: ${inputDirectory}`);

	await traverseDirectoryRecursively(inputDirectory, outputFilePath);
	console.log(`Done. All file contents written to: ${outputFilePath}`);
}

try {
	await main();
} catch (error) {
	console.erro(error);
}

function getConfig() {
	const defaultConfig = {
		scan: ".",
		include: [],
		exclude: ["node_modules", ".git", "dist", "build"],
		extensions: [".js", ".ts", ".json"],
		showExcluded: true,
		showSkipped: true,
		outputFile: "output.sick",
	};

	const configFile = cosmiconfigSync("vomitorium").search();
	return configFile
		? { ...defaultConfig, ...configFile.config }
		: defaultConfig;
}

function isExcluded(filePath) {
	const relativeFilePath = path.relative(process.cwd(), filePath);
	return excludePatterns.some(
		(excludePattern) =>
			relativeFilePath.includes(excludePattern) ||
			path.basename(filePath) === excludePattern,
	);
}

async function traverseDirectoryRecursively(directoryPath, outputFilePath) {
	try {
		const directoryEntries = await fs.readdir(directoryPath, {
			withFileTypes: true,
		});

		await Promise.all(
			directoryEntries.map(async (entry) => {
				const entryPath = path.join(directoryPath, entry.name);

				if (isExcluded(entryPath)) {
					if (showExcluded) {
						await logSkippedFile(entryPath, outputFilePath, "Excluded");
					}

					return;
				}

				if (entry.isDirectory()) {
					if (
						includeDirectories.length === 0 ||
						includeDirectories.some((includeDirectory) =>
							entryPath.includes(includeDirectory),
						)
					) {
						await traverseDirectoryRecursively(entryPath, outputFilePath);
					}

					return;
				}

				const extension = path.extname(entry.name);

				if (!includeExtensions.includes(extension)) {
					if (showSkipped) {
						await logSkippedFile(
							entryPath,
							outputFilePath,
							"Skipped (non-matching extension)",
						);
					}

					return;
				}

				await appendFileToOutput(entryPath, outputFilePath);
			}),
		);
	} catch (error) {
		console.error(`Error traversing directory ${directoryPath}:`, error);
	}
}

async function appendFileToOutput(sourceFilePath, outputFilePath) {
	try {
		const fileContent = await fs.readFile(sourceFilePath, "utf8");
		const relativePath = path.relative(process.cwd(), sourceFilePath);

		await fs.appendFile(
			outputFilePath,
			`\n\n--- File: ${relativePath} ---\n\n${fileContent}\n`,
		);
	} catch (error) {
		throw new Error(`Error appending file ${sourceFilePath}: ${error.message}`);
	}
}

async function logSkippedFile(filePath, outputFilePath, reason) {
	const relativePath = path.relative(process.cwd(), filePath);
	await fs.appendFile(
		outputFilePath,
		`\n\n--- File: ${relativePath} ---\n(${reason})\n`,
	);
	console.log(`Skipped file: ${relativePath} (${reason})`);
}
