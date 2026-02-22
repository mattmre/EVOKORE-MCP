# Contributing to EVOKORE-MCP

Thank you for your interest in contributing to EVOKORE-MCP! We welcome additions to our library of Agent Skills, MCP Prompts, and Workflow architectures.

## The Pull Request Workflow

We use a strict Pull Request (PR) only workflow. Direct commits to the main branch are restricted. 

To contribute a new skill or workflow:

1. **Fork the Repository**: Create your own fork of mattmre/EVOKORE-MCP.
2. **Create a Branch**: Create a feature branch for your new skill.
3. **Add Your Skill**:
   - Create a new directory within the appropriate category in the SKILLS/ directory.
   - Add your SKILL.md file (and any supporting assets).
   - **Crucial**: Ensure your SKILL.md begins with valid YAML frontmatter containing a name and description.
   
4. **Test Locally**: Run 
ode scripts/clean_skills.js to ensure your YAML frontmatter parses correctly.
5. **Submit a Pull Request**: Open a PR against the main branch of this repository.

## Modifying the Core Server

If modifying the core MCP server implementation (src/index.ts):
1. Run 
pm install.
2. Make your changes in src/index.ts.
3. Run 
px tsc to compile to dist/index.js.
4. Submit your PR. Our CI pipeline will automatically verify the build.
