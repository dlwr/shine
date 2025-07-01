const {execSync} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

// Read .dev.vars file and set environment variables
const devVarsPath = path.join(__dirname, '..', '.dev.vars');
if (fs.existsSync(devVarsPath)) {
	const devVars = fs.readFileSync(devVarsPath, 'utf8');
	for (const line of devVars.split('\n')) {
		const [key, value] = line.split('=');
		if (key && value) {
			process.env[key] = value;
		}
	}
}

// Execute the command passed as arguments
const command = process.argv.slice(2).join(' ');
execSync(command, {stdio: 'inherit'});
