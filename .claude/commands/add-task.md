Create a new task on the MediaForge Monday.com Weekly Task Tracker board.

## Instructions

You MUST follow these rules when creating a task:

### 1. Task Name
- Keep it **short and clear** (under 60 characters)
- Describe the what, not the how
- Use English or Thai depending on what the user provides

### 2. Required Fields
Ask the user for any missing info before creating:
- **Task name** (required)
- **Team** (required): Product & Engineering, Marketing, Creative, or Account
- **Type** (required): Feature, Bug, Improvement, Content, Campaign, Design, Research, Admin, or QA/Testing
- **Priority** (required): Critical, Medium, High, or Low
- **Group** (optional): Default to current active week group. Use "Backlog" group for future/idea tasks.

### 3. Default Values
- **Status**: Always set to `Not Started`
- **Subtasks**: Do NOT create subitems unless the task clearly involves a large number of discrete steps

### 4. Update (Required)
After creating the task, you MUST create an update on the item with this structure (use HTML tags):

```
<h3>Problem / Objective</h3>
<p>[Why this task exists — the problem to solve or goal to achieve]</p>

<h3>Overview</h3>
<p>[Brief description of the scope and approach]</p>

<h3>Action</h3>
<ul>
<li>[Step or action item 1]</li>
<li>[Step or action item 2]</li>
<li>[...]</li>
</ul>

<h3>Done When</h3>
<ul>
<li>[Validation criteria 1 — how to know this task is complete]</li>
<li>[Validation criteria 2]</li>
</ul>
```

### 5. Pin the Update
After creating the update, pin it to the top of the item using the `pin_to_top` mutation.

## Board Reference

- **Board ID**: 5027314872
- **Team column** (`color_mm29y7fp`): Product & Engineering=1, Marketing=0, Creative=7, Account=2
- **Type column** (`color_mm2955x4`): Feature=0, Bug=2, Improvement=7, Content=6, Campaign=9, Design=4, Research=3, Admin=17, QA/Testing=1
- **Priority column** (`color_mm27yq84`): Critical=0, High=2, Medium=1, Low=3
- **Status column** (`color_mm28webr`): Not Started=17, In Progress=0, In Review=7, Stuck=2, Done=1
- **Groups**: `group_mm1ktxas` (current week), `group_mm22sqd0` (Backlog)

## Workflow

1. Parse user input for task details
2. Ask for any missing required fields
3. Create the item with `create_item` tool
4. Create the detailed update with `create_update` tool
5. Pin the update using GraphQL: `mutation { pin_to_top(id: <update_id>) { id } }`
6. Return the task URL to the user
