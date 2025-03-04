# RAG (Retrieval-Augmented Generation) Implementation

This document describes the RAG implementation for the bill tracker application, which uses Pinecone for vector storage and retrieval.

## Overview

The RAG system consists of the following components:

1. **Pinecone Service**: Handles vector storage and retrieval using the Pinecone vector database.
2. **RAG Service**: Implements the retrieval-augmented generation functionality.
3. **RAG Routes**: Provides API endpoints for querying the RAG model and uploading data to Pinecone.
4. **Express Server**: Serves the RAG API endpoints.

## Setup

### Prerequisites

-   Node.js 18+
-   Yarn package manager
-   Pinecone API key (set in `.env` file)

### Environment Variables

Make sure the following environment variables are set in your `.env` file:

```
PINECONE_API_KEY="your-pinecone-api-key"
PINECONE_ENVIRONMENT="your-pinecone-environment" # e.g., "us-east-1"
```

### Installation

```bash
yarn install
```

## Usage

### Running the Crawler with RAG

To run the crawler and set up the RAG API server:

```bash
yarn start:dev
```

With custom input:

```json
{
    "startUrls": [
        "https://www.nysenate.gov/search/legislation?type=bill&session_year=2025&status=SIGNED_BY_GOV&is_active_version=1"
    ],
    "maxRequestsPerCrawl": 100,
    "forceRun": true,
    "setupRagApi": true
}
```

### API Endpoints

#### Query the RAG Model

```
POST /api/rag/query
```

Request body:

```json
{
    "query": "What bills are related to healthcare?"
}
```

Response:

```json
{
  "answer": "Based on the bills I found, there are several healthcare-related bills...",
  "sources": [
    {
      "billTitle": "S1234",
      "url": "https://www.nysenate.gov/legislation/bills/2025/S1234",
      "score": 0.92
    },
    ...
  ]
}
```

#### Upload Dataset to Pinecone

```
POST /api/rag/upload-dataset
```

Response:

```json
{
    "success": true,
    "message": "Successfully uploaded 150 items to Pinecone."
}
```

## Implementation Details

### Pinecone Service

The Pinecone service (`src/pinecone-service.ts`) handles:

-   Initializing the Pinecone index
-   Generating embeddings for text
-   Uploading bill data to Pinecone
-   Querying Pinecone for similar bills

### RAG Service

The RAG service (`src/rag-service.ts`) implements:

-   Retrieving relevant bills from Pinecone based on a query
-   Generating answers based on the retrieved bills
-   Formatting responses with sources

### RAG Routes

The RAG routes (`src/rag-routes.ts`) provide:

-   API endpoint for querying the RAG model
-   API endpoint for uploading the dataset to Pinecone

## Notes

-   The current implementation uses a mock embedding function. In a production environment, you should use a real embedding API like OpenAI's.
-   The answer generation is also mocked. In a production environment, you would use an LLM API like OpenAI's GPT-4.
-   The Pinecone index is configured with a dimension of 1536, which is compatible with OpenAI's embedding models.
