# An Agentic System for Natural-Language Device Discovery on the Web of Things


The increasing number and diversity of devices in Web of Things (WoT) environments necessitate discovery mechanisms capable of interpreting complex user requirements. WoT discovery services support structured search via JSONPath and SPARQL, but natural-language discovery has relied on AI models trained on predefined datasets, limiting adaptability to new devices. This paper proposes an LLM-based multi-agent system that extends WoT discovery services with natural-language device discovery, functioning as an optional external service. Specialized agents summarize Thing Descriptions (TDs), interpret user requests, and match requirements with devices in the directory; device summaries update dynamically as TDs change, eliminating the need for model retraining. The approach is integrated with WoTtrader and evaluated in a Smart Home scenario (82 devices, 21 rooms), comparing Qwen2.5-Coder-7B and Claude Sonnet 5 against a prior Transformer-based approach. Results indicate that the multi-agent approach enhances accuracy and adaptability, with Claude achieving a mean Precision@n of 90% and Recall@n of 100%, albeit at increased processing time.

## Components

- `wot-directory/`: WoTtrader discovery service.
- `Agents/`: FastAPI-based multi-agent service.
- `dataset/`: experimental dataset and population script.
- `Results/`: experimental outputs for summary generation and natural-language discovery runs.
- `docker-compose.yml`: integrated deployment for WoTtrader, databases, and the agent service.

## Multi-Agent Architecture

The agent service is designed as an external and optional component. It exposes an API used by WoTtrader and internally coordinates three specialized agents:

- Agent 1 summarizes Thing Descriptions into a compact catalog.
- Agent 2 interprets a natural-language request and converts it into a structured query plan.
- Agent 3 matches the query plan against the summary catalog and returns ranked candidate TDs.

This design keeps WoTtrader operational even if the agent service is unavailable, while allowing new or updated devices to participate in natural-language discovery without retraining a model.

## Relevant Endpoints

### WoTtrader

- `GET /search/agents/{sentence}`: checks the multi-agent service, uses the local summary catalog, and returns candidate TDs for a natural-language query.
- `GET /docs/`: OpenAPI documentation for WoTtrader, available by default at `http://localhost:3021/docs/`.

### Multi-agent service

- `GET /health`: returns the availability status of the agent service.
- `GET /api/summaries`: generates a summary catalog from the TDs currently available in the associated WoTtrader node.
- `POST /api/summaries`: generates a summary catalog from the TDs provided in the request body.
- `POST /api/interpret`: debug endpoint that runs only the request interpretation agent.
- `POST /api/candidates`: receives a natural-language request and a summary catalog, then returns ranked candidate TDs with their complete Thing Descriptions.

## Docker Quick Start

The repository root already includes the required `docker-compose.yml`, `fuseki-config.ttl`, and `init-mongo.js` files.

The current compose deployment includes:

- a WoTtrader node backed by MongoDB and Fuseki,
- the `wotragents` multi-agent service,
- an `ollama` service,
- an auxiliary container that pulls `qwen2.5-coder:7b` automatically for local inference.

Run:

```bash
docker compose up -d
```

Important runtime details:

- `wotragents` uses Ollama by default.
- the compose file configures `OLLAMA_MODEL=qwen2.5-coder:7b`.
- inside Docker, the agent service reaches WoTtrader through `http://wottrader1:3000`.

Useful local URLs after startup:

- WoTtrader OpenAPI: `http://localhost:3021/docs/`
- Agent service health: `http://localhost:8001/health`
- Agent service OpenAPI: `http://localhost:8001/docs/`

## Experimental Scenario

For deploying the experimental scenario with multiple nodes and third-party directories, use the repository `docker-compose.yml` and the dataset included in `dataset/`.

To populate the directories, run:

```bash
cd dataset
python poblateDirectories.py
```

The population script inserts devices with a delay to avoid overloading the services. If a directory fails during startup because a dependency was not ready yet, restart the affected service.

## Results

The repository includes a `Results/` folder with the experimental artifacts used in the evaluation.

- `Results/Summaries/`: generated summary catalogs for Qwen and Claude, including the final catalogs used in the experiments.
- `Results/Sentences/`: per-query execution outputs for Qwen and Claude, organized by sentence.
