#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { program } from "commander";
import { cosmiconfigSync } from "cosmiconfig";

/**
 * Cosmiconfig explorer for 'vomitorium' configuration.
 * @type {import('cosmiconfig').ExplorerSync}
 */
const explorer = cosmiconfigSync("vomitorium");

/**
 * Default configuration for the script.
 * @type {Object}
 */
const defaultConfig = {
	scan: ".",
	include: [],
	exclude: ["node_modules", ".git", "dist", "build"],
	excludeFiles: ["package.json", "package-lock.json"],
	extensions: [".js", ".ts", ".json"],
	showExcluded: true,
	showSkipped: true,
	outputFile: "output.sick",
};

// Read config from file or use default
const configFile = explorer.search();
const config = configFile
	? { ...defaultConfig, ...configFile.config }
	: defaultConfig;

// Command-line options
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

program.addHelpText(
	"after",
	`
  Examples:
    $ vomitorium --scan ./myproject --include src,tests
    $ vomitorium --exclude node_modules,dist,package.json --extensions .js,.ts
    $ vomitorium --scan /path/to/project --show-excluded --show-skipped
    $ vomitorium --output my-custom-output.txt
  `,
);

program.parse(process.argv);

const options = program.opts();
const scanDirectory = options.scan || config.scan;
const includeDirectories = options.include || config.include;
const excludePatterns = options.exclude || [
	...config.exclude,
	...config.excludeFiles,
];
const includeExtensions = options.extensions || config.extensions;
const showExcluded =
	options.showExcluded === undefined
		? config.showExcluded
		: options.showExcluded;
const showSkipped =
	options.showSkipped === undefined ? config.showSkipped : options.showSkipped;
const outputFile = options.output || config.outputFile;

/**
 * Checks if a file should be excluded based on the excludePatterns.
 * @param {string} filePath - The path of the file to check.
 * @returns {boolean} True if the file should be excluded, false otherwise.
 */
function isExcluded(filePath) {
	const relativeFilePath = path.relative(process.cwd(), filePath);
	return excludePatterns.some(
		(excludePattern) =>
			relativeFilePath.includes(excludePattern) ||
			path.basename(filePath) === excludePattern,
	);
}

/**
 * Recursively traverses a directory and processes its files.
 * @param {string} rootDirectoryPath - The path of the directory to traverse.
 * @param {string} outputFilePath - The path of the output file.
 * @returns {Promise<void>}
 */
async function traverseDirectoryRecursively(rootDirectoryPath, outputFilePath) {
	try {
		const directoryEntries = await fs.readdir(rootDirectoryPath, {
			withFileTypes: true,
		});

		await Promise.all(
			directoryEntries.map(async (entry) => {
				const entryPath = path.join(rootDirectoryPath, entry.name);

				if (isExcluded(entryPath)) {
					if (showExcluded) {
						await logSkippedFile(entryPath, outputFilePath, "Excluded");
					}

					return;
				}

				if (entry.isDirectory()) {
					if (
						includeDirectories.length === 0 ||
						includeDirectories.some((dir) => entryPath.includes(dir))
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
		console.error(`Error traversing directory ${rootDirectoryPath}:`, error);
	}
}

/**
 * Appends the contents of a single file to the output file.
 * @param {string} sourceFilePath - The path of the file to append.
 * @param {string} outputFilePath - The path of the output file.
 * @returns {Promise<void>}
 */
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

/**
 * Logs a skipped file to the output file.
 * @param {string} filePath - The path of the skipped file.
 * @param {string} outputFilePath - The path of the output file.
 * @param {string} reason - The reason for skipping the file.
 * @returns {Promise<void>}
 */
async function logSkippedFile(filePath, outputFilePath, reason) {
	const relativePath = path.relative(process.cwd(), filePath);
	await fs.appendFile(
		outputFilePath,
		`\n\n--- File: ${relativePath} ---\n(${reason})\n`,
	);
	console.log(`Skipped file: ${relativePath} (${reason})`);
}

/**
 * Main function to execute the script.
 * @returns {Promise<void>}
 */
async function main() {
	const targetDirectory = path.resolve(scanDirectory);
	const outputFilePath = path.join(process.cwd(), outputFile);

	try {
		await fs.access(targetDirectory);
	} catch {
		console.error(
			`Error: Directory "${targetDirectory}" does not exist or is inaccessible.`,
		);
		process.exit(1);
	}

	await fs.writeFile(outputFilePath, "");

	console.log(`Traversing directory: ${targetDirectory}`);

	await traverseDirectoryRecursively(targetDirectory, outputFilePath);
	console.log(`Done. All file contents written to: ${outputFilePath}`);
}

main().catch(console.error);
