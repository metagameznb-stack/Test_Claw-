// src/commands/auth-choice-options.ts

// Local providers
const localProviders = [
    'ollama-local',
    'lm-studio-local'
];

// Existing cloud providers
const cloudProviders = [
    // Add your existing cloud providers here
];

// Function to build auth choice options
function buildAuthChoiceOptions() {
    return [...localProviders, ...cloudProviders];
}

// Function to build auth choice groups
function buildAuthChoiceGroups() {
    return {
        local: localProviders,
        cloud: cloudProviders
    };
}

export { buildAuthChoiceOptions, buildAuthChoiceGroups };