# Outline MCP Server - Parameter Reference

This resource provides comprehensive documentation for all parameter types and acceptable values used in the Outline MCP tools.

## Document Status Filters

Used in: `search_documents`, `list_documents`

**Parameter**: `statusFilter`
**Type**: Enum
**Acceptable Values**:
- `"draft"` - Documents that are still being written
- `"archived"` - Documents that have been archived
- `"published"` - Documents that are publicly visible

**Example Usage**:
```json
{
  "statusFilter": "published"
}
```

## Date Filters

Used in: `search_documents`, `list_documents`

**Parameter**: `dateFilter`
**Type**: Enum
**Acceptable Values**:
- `"day"` - Documents updated in the last 24 hours
- `"week"` - Documents updated in the last 7 days
- `"month"` - Documents updated in the last 30 days
- `"year"` - Documents updated in the last 365 days

**Example Usage**:
```json
{
  "dateFilter": "week"
}
```

## Collection Colors

Used in: `create_collection`, `update_collection`

**Parameter**: `color`
**Type**: String (Hex Color Code)
**Format**: 6-character hex code with # prefix
**Examples**:
- `"#FF6B6B"` - Red
- `"#4ECDC4"` - Teal
- `"#45B7D1"` - Blue
- `"#96CEB4"` - Green
- `"#FFEAA7"` - Yellow
- `"#DDA0DD"` - Plum
- `"#98D8C8"` - Mint

**Example Usage**:
```json
{
  "color": "#FF6B6B"
}
```

## Collection Icons

Used in: `create_collection`, `update_collection`

**Parameter**: `icon`
**Type**: String
**Format**: Emoji or icon name from outline-icons package

**Popular Emoji Examples**:
- `"📁"` - Folder
- `"🏢"` - Office building
- `"📊"` - Bar chart
- `"🎯"` - Target
- `"💼"` - Briefcase
- `"🔧"` - Wrench
- `"📚"` - Books
- `"🌟"` - Star
- `"🚀"` - Rocket
- `"⚙️"` - Gear

**Example Usage**:
```json
{
  "icon": "📁"
}
```

## Collection Permissions

Used in: `create_collection`, `update_collection`

**Parameter**: `permission`
**Type**: String
**Common Values** (exact enum values not specified in API docs):
- `"read"` - Read-only access
- `"write"` - Read and write access
- `"admin"` - Full administrative access

**Example Usage**:
```json
{
  "permission": "write"
}
```

## UUID Parameters

Used in: All tools with ID parameters

**Parameters**: `id`, `userId`, `collectionId`, `documentId`, `parentDocumentId`, `templateId`
**Type**: String (UUID format)
**Format**: Standard UUID (e.g., "550e8400-e29b-41d4-a716-446655440000")

**Example Usage**:
```json
{
  "collectionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

## Boolean Parameters

Used in: Various tools

**Parameters**: `template`, `publish`, `append`, `done`, `sharing`
**Type**: Boolean
**Values**: `true` or `false`

**Example Usage**:
```json
{
  "publish": true,
  "template": false
}
```

## Pagination Parameters

Used in: `search_documents`, `list_documents`, `list_collections`

**Parameters**: `offset`, `limit`
**Type**: Number
**Default Values**:
- `offset`: 0 (start from beginning)
- `limit`: 10-25 (varies by endpoint)

**Example Usage**:
```json
{
  "offset": 20,
  "limit": 50
}
```

## Search and Text Parameters

**Parameter**: `query` (search_documents)
**Type**: String
**Format**: Free text search query
**Examples**:
- `"meeting notes"` - Search for meeting-related documents
- `"project status"` - Find project updates
- `"quarterly report"` - Locate specific reports

**Parameter**: `text` (create_document, update_document)
**Type**: String
**Format**: Markdown content
**Example**:
```json
{
  "text": "# Meeting Notes\n\n## Agenda\n- Review quarterly goals\n- Discuss budget allocation"
}
```

## Combined Example Usage

**Advanced Document Search**:
```json
{
  "query": "quarterly report",
  "statusFilter": "published",
  "dateFilter": "month",
  "collectionId": "550e8400-e29b-41d4-a716-446655440000",
  "limit": 20
}
```

**Create Styled Collection**:
```json
{
  "name": "Marketing Team",
  "description": "Marketing materials and campaign documentation",
  "icon": "📊",
  "color": "#4ECDC4",
  "permission": "write",
  "sharing": true
}
```