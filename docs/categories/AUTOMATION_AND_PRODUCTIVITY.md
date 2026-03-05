# 📂 Category: AUTOMATION AND PRODUCTIVITY

This section details the extensive use cases and training materials for the `AUTOMATION AND PRODUCTIVITY` domain.

---

## 🛠️ Skill: `brand-guidelines`

**Description:** Applies Anthropic's official brand colors and typography to any sort of artifact that may benefit from having Anthropic's look-and-feel. Use it when brand colors or style guidelines, visual formatting, or company design standards apply.

### 🧠 Core Directives & Framework
*No specific directives found.*


#### 🎯 Primary Use Cases
1. **Direct Execution**: When you need to immediately apply the `brand-guidelines` workflow to the current task.
2. **Consultation**: When asking the AI to review your existing architecture against the principles defined in `brand-guidelines`.
3. **Orchestration**: As part of a larger multi-agent sequence where `brand-guidelines` handles a specific specialized sub-task.

#### 💡 Training & Invocation Examples
To trigger this skill in your AI assistant, use explicit phrasing:
> *"Adopt the **brand-guidelines** workflow to accomplish this task."*
> *"Please load the **brand-guidelines** skill and evaluate my code."*
> *"Use the `search_skills` tool to find the exact instructions for **brand-guidelines**."*

---

## 🛠️ Skill: `file-organizer`

**Description:** Intelligently organizes your files and folders across your computer by understanding context, finding duplicates, suggesting better structures, and automating cleanup tasks. Reduces cognitive load and keeps your digital workspace tidy without manual effort.

### 🧠 Core Directives & Framework
> ' | sort | uniq -d
   
   # Find similar-sized files
   find [directory] -type f -printf '%s %p
> ' | sort -n
   ```
   
   For each set of duplicates:
   - Show all file paths
   - Display sizes and modification dates
   - Recommend which to keep (usually newest or best-named)
   - **Important**: Always ask for confirmation before deleting

5. **Propose Organization Plan**
   
   Present a clear plan before making changes:
   
   ```markdown
   # Organization Plan for [Directory]
   
   ## Current State
   - X files across Y folders
   - [Size] total
   - File types: [breakdown]
   - Issues: [list problems]
   
   ## Proposed Structure
   
   ```
   [Directory]/
   ├── Work/
   │   ├── Projects/
   │   ├── Documents/
   │   └── Archive/
   ├── Personal/
   │   ├── Photos/
   │   ├── Documents/
   │   └── Media/
   └── Downloads/
       ├── To-Sort/
       └── Archive/
   ```
   
   ## Changes I'll Make
   
   1. **Create new folders**: [list]
   2. **Move files**:
      - X PDFs → Work/Documents/
      - Y images → Personal/Photos/
      - Z old files → Archive/
   3. **Rename files**: [any renaming patterns]
   4. **Delete**: [duplicates or trash files]
   
   ## Files Needing Your Decision
   
   - [List any files you're unsure about]
   
   Ready to proceed? (yes/no/modify)
   ```

6. **Execute Organization**
   
   After approval, organize systematically:
   
   ```bash
   # Create folder structure
   mkdir -p "path/to/new/folders"
   
   # Move files with clear logging
   mv "old/path/file.pdf" "new/path/file.pdf"
   
   # Rename files with consistent patterns
   # Example: "YYYY-MM-DD - Description.ext"
   ```
   
   **Important Rules**:
   - Always confirm before deleting anything
   - Log all moves for potential undo
   - Preserve original modification dates
   - Handle filename conflicts gracefully
   - Stop and ask if you encounter unexpected situations

7. **Provide Summary and Maintenance Tips**
   
   After organizing:
   
   ```markdown
   # Organization Complete! ✨
   
   ## What Changed
   
   - Created [X] new folders
   - Organized [Y] files
   - Freed [Z] GB by removing duplicates
   - Archived [W] old files
   
   ## New Structure
   
   [Show the new folder tree]
   
   ## Maintenance Tips
   
   To keep this organized:
   
   1. **Weekly**: Sort new downloads
   2. **Monthly**: Review and archive completed projects
   3. **Quarterly**: Check for new duplicates
   4. **Yearly**: Archive old files
   
   ## Quick Commands for You
   
   ```bash
   # Find files modified this week
   find . -type f -mtime -7
   
   # Sort downloads by type
   [custom command for their setup]
   
   # Find duplicates
   [custom command]
   ```
   
   Want to organize another folder?
   ```

## Examples

### Example 1: Organizing Downloads (From Justin Dielmann)

**User**: "My Downloads folder is a mess with 500+ files. Help me organize it."

**Process**:
1. Analyzes Downloads folder
2. Finds patterns: work docs, personal photos, installers, random PDFs
3. Proposes structure:
   - Downloads/
     - Work/
     - Personal/
     - Installers/ (DMG, PKG files)
     - Archive/
     - ToSort/ (things needing decisions)
4. Asks for confirmation
5. Moves files intelligently based on content and names
6. Results: 500 files → 5 organized folders

### Example 2: Finding and Removing Duplicates

**User**: "Find duplicate files in my Documents and help me decide which to keep."

**Output**:
```markdown
# Found 23 Sets of Duplicates (156 MB total)

## Duplicate Set 1: "proposal.pdf"
- `/Documents/proposal.pdf` (2.3 MB, modified: 2024-03-15)
- `/Documents/old/proposal.pdf` (2.3 MB, modified: 2024-03-15)
- `/Desktop/proposal.pdf` (2.3 MB, modified: 2024-03-10)

**Recommendation**: Keep `/Documents/proposal.pdf` (most recent in correct location)
Delete the other 2 copies?

[Continue for all duplicates...]
```

### Example 3: Restructuring Projects Folder

**User**: "Review my ~/Projects directory and suggest improvements."

**Output**:
```markdown
# Analysis of ~/Projects

## Current Structure Issues
- Mix of active and archived projects (3+ years old)
- No consistent naming convention
- Some projects at root, others in random subfolders
- Duplicate folders (project-name, project-name-old, project-name-v2)

## Proposed Structure

```
Projects/
├── Active/
│   ├── client-work/
│   ├── side-projects/
│   └── learning/
├── Archive/
│   ├── 2022/
│   ├── 2023/
│   └── 2024/
└── Templates/
```

## Specific Changes
1. Move 12 projects not touched since 2022 → Archive/
2. Consolidate 4 duplicate project folders
3. Rename projects to consistent format: "client-name-project-name"
4. Create Archive for old work

Want me to implement this?
```

### Example 4: Organizing Photos by Date

**User**: "Organize my photo folders by year and month."

**Output**: Creates structure like:
```
Photos/
├── 2023/
│   ├── 01-January/
│   ├── 02-February/
│   └── ...
├── 2024/
│   ├── 01-January/
│   └── ...
└── Unsorted/
```

Then moves photos based on EXIF data or file modification dates.

## Common Organization Tasks

### Downloads Cleanup
```
Organize my Downloads folder - move documents to Documents, 
images to Pictures, keep installers separate, and archive files 
older than 3 months.
```

### Project Organization
```
Review my Projects folder structure and help me separate active 
projects from old ones I should archive.
```

### Duplicate Removal
```
Find all duplicate files in my Documents folder and help me 
decide which ones to keep.
```

### Desktop Cleanup
```
My Desktop is covered in files. Help me organize everything into 
my Documents folder properly.
```

### Photo Organization
```
Organize all photos in this folder by date (year/month) based 
on when they were taken.
```

### Work/Personal Separation
```
Help me separate my work files from personal files across my 
Documents folder.
```

## Pro Tips

1. **Start Small**: Begin with one messy folder (like Downloads) to build trust
2. **Regular Maintenance**: Run weekly cleanup on Downloads
3. **Consistent Naming**: Use "YYYY-MM-DD - Description" format for important files
4. **Archive Aggressively**: Move old projects to Archive instead of deleting
5. **Keep Active Separate**: Maintain clear boundaries between active and archived work
6. **Trust the Process**: Let Claude handle the cognitive load of where things go

## Best Practices

### Folder Naming
- Use clear, descriptive names
- Avoid spaces (use hyphens or underscores)
- Be specific: "client-proposals" not "docs"
- Use prefixes for ordering: "01-current", "02-archive"

### File Naming
- Include dates: "2024-10-17-meeting-notes.md"
- Be descriptive: "q3-financial-report.xlsx"
- Avoid version numbers in names (use version control instead)
- Remove download artifacts: "document-final-v2 (1).pdf" → "document.pdf"

### When to Archive
- Projects not touched in 6+ months
- Completed work that might be referenced later
- Old versions after migration to new systems
- Files you're hesitant to delete (archive first)

## Related Use Cases

- Setting up organization for a new computer
- Preparing files for backup/archiving
- Cleaning up before storage cleanup
- Organizing shared team folders
- Structuring new project directories


#### 🎯 Primary Use Cases
1. **Direct Execution**: When you need to immediately apply the `file-organizer` workflow to the current task.
2. **Consultation**: When asking the AI to review your existing architecture against the principles defined in `file-organizer`.
3. **Orchestration**: As part of a larger multi-agent sequence where `file-organizer` handles a specific specialized sub-task.

#### 💡 Training & Invocation Examples
To trigger this skill in your AI assistant, use explicit phrasing:
> *"Adopt the **file-organizer** workflow to accomplish this task."*
> *"Please load the **file-organizer** skill and evaluate my code."*
> *"Use the `search_skills` tool to find the exact instructions for **file-organizer**."*

---

## 🛠️ Skill: `image-enhancer`

**Description:** Improves the quality of images, especially screenshots, by enhancing resolution, sharpness, and clarity. Perfect for preparing images for presentations, documentation, or social media posts.

### 🧠 Core Directives & Framework
*No specific directives found.*


#### 🎯 Primary Use Cases
1. **Direct Execution**: When you need to immediately apply the `image-enhancer` workflow to the current task.
2. **Consultation**: When asking the AI to review your existing architecture against the principles defined in `image-enhancer`.
3. **Orchestration**: As part of a larger multi-agent sequence where `image-enhancer` handles a specific specialized sub-task.

#### 💡 Training & Invocation Examples
To trigger this skill in your AI assistant, use explicit phrasing:
> *"Adopt the **image-enhancer** workflow to accomplish this task."*
> *"Please load the **image-enhancer** skill and evaluate my code."*
> *"Use the `search_skills` tool to find the exact instructions for **image-enhancer**."*

---

## 🛠️ Skill: `invoice-organizer`

**Description:** Automatically organizes invoices and receipts for tax preparation by reading messy files, extracting key information, renaming them consistently, and sorting them into logical folders. Turns hours of manual bookkeeping into minutes of automated organization.

### 🧠 Core Directives & Framework
*No specific directives found.*


#### 🎯 Primary Use Cases
1. **Direct Execution**: When you need to immediately apply the `invoice-organizer` workflow to the current task.
2. **Consultation**: When asking the AI to review your existing architecture against the principles defined in `invoice-organizer`.
3. **Orchestration**: As part of a larger multi-agent sequence where `invoice-organizer` handles a specific specialized sub-task.

#### 💡 Training & Invocation Examples
To trigger this skill in your AI assistant, use explicit phrasing:
> *"Adopt the **invoice-organizer** workflow to accomplish this task."*
> *"Please load the **invoice-organizer** skill and evaluate my code."*
> *"Use the `search_skills` tool to find the exact instructions for **invoice-organizer**."*

---

## 🛠️ Skill: `slack-gif-creator`

**Description:** Toolkit for creating animated GIFs optimized for Slack, with validators for size constraints and composable animation primitives. This skill applies when users request animated GIFs or emoji animations for Slack from descriptions like "make me a GIF for Slack of X doing Y".

### 🧠 Core Directives & Framework
*No specific directives found.*


#### 🎯 Primary Use Cases
1. **Direct Execution**: When you need to immediately apply the `slack-gif-creator` workflow to the current task.
2. **Consultation**: When asking the AI to review your existing architecture against the principles defined in `slack-gif-creator`.
3. **Orchestration**: As part of a larger multi-agent sequence where `slack-gif-creator` handles a specific specialized sub-task.

#### 💡 Training & Invocation Examples
To trigger this skill in your AI assistant, use explicit phrasing:
> *"Adopt the **slack-gif-creator** workflow to accomplish this task."*
> *"Please load the **slack-gif-creator** skill and evaluate my code."*
> *"Use the `search_skills` tool to find the exact instructions for **slack-gif-creator**."*

---

## 🛠️ Skill: `tailored-resume-generator`

**Description:** Analyzes job descriptions and generates tailored resumes that highlight relevant experience, skills, and achievements to maximize interview chances

### 🧠 Core Directives & Framework
*No specific directives found.*


#### 🎯 Primary Use Cases
1. **Direct Execution**: When you need to immediately apply the `tailored-resume-generator` workflow to the current task.
2. **Consultation**: When asking the AI to review your existing architecture against the principles defined in `tailored-resume-generator`.
3. **Orchestration**: As part of a larger multi-agent sequence where `tailored-resume-generator` handles a specific specialized sub-task.

#### 💡 Training & Invocation Examples
To trigger this skill in your AI assistant, use explicit phrasing:
> *"Adopt the **tailored-resume-generator** workflow to accomplish this task."*
> *"Please load the **tailored-resume-generator** skill and evaluate my code."*
> *"Use the `search_skills` tool to find the exact instructions for **tailored-resume-generator**."*

---

## 🛠️ Skill: `theme-factory`

**Description:** Toolkit for styling artifacts with a theme. These artifacts can be slides, docs, reportings, HTML landing pages, etc. There are 10 pre-set themes with colors/fonts that you can apply to any artifact that has been creating, or can generate a new theme on-the-fly.

### 🧠 Core Directives & Framework
*No specific directives found.*


#### 🎯 Primary Use Cases
1. **Direct Execution**: When you need to immediately apply the `theme-factory` workflow to the current task.
2. **Consultation**: When asking the AI to review your existing architecture against the principles defined in `theme-factory`.
3. **Orchestration**: As part of a larger multi-agent sequence where `theme-factory` handles a specific specialized sub-task.

#### 💡 Training & Invocation Examples
To trigger this skill in your AI assistant, use explicit phrasing:
> *"Adopt the **theme-factory** workflow to accomplish this task."*
> *"Please load the **theme-factory** skill and evaluate my code."*
> *"Use the `search_skills` tool to find the exact instructions for **theme-factory**."*

---

