# ThreatLens AI

## AI-Powered Unified Cybersecurity Incident Management Platform

ThreatLens AI is an AI-powered cybersecurity incident management platform designed to combine multimodal threat analysis with human-in-the-loop incident management.

The platform is designed to allow clients to report security incidents, use AI to analyze and prioritize those incidents, and enable security analysts to investigate, manage, escalate, resolve, and close them through a unified workflow.

---

## Project Status

🚧 **Early Development**

ThreatLens AI is currently in the initial development stage.

The current milestone focuses on establishing the core application architecture and development foundation. Features will be implemented incrementally throughout the project.

AI models and performance metrics will only be reported after actual training and evaluation.

---

## Problem Statement

Modern organizations receive security incidents from multiple sources, including suspicious emails, URLs, messages, files, screenshots, and other security events.

Security teams can face:

- Large volumes of security alerts
- Alert fatigue
- Manual investigation processes
- Slow incident response
- Inconsistent incident prioritization
- Fragmented security workflows
- Difficulty connecting threat detection with incident response

ThreatLens AI aims to address these problems by bringing AI-assisted threat analysis and incident management into a single platform.

---

## Objective

The objective of ThreatLens AI is to develop a unified cybersecurity platform that connects:

- Security incident reporting
- AI-powered threat analysis
- Threat classification
- Incident prioritization
- Security analyst investigation
- Incident escalation
- Incident resolution
- Security analytics

The platform follows a human-in-the-loop approach where AI assists security analysts while humans retain control over important security decisions.

---

## Core Workflow

Client submits security incident  
↓  
AI Analysis  
↓  
Threat Classification  
↓  
Priority Prediction  
↓  
Confidence Score  
↓  
Recommended Actions  
↓  
Incident Created  
↓  
Analyst Investigation  
↓  
Accept / Modify / Reject AI Recommendation  
↓  
Escalation if required  
↓  
Resolve  
↓  
Close

---

## AI Architecture

ThreatLens AI is designed as a multimodal AI system.

Different types of security information can be processed using different neural network architectures.

**Security Incident**

→ **Text** → **LSTM**

→ **Image** → **CNN**

→ **Structured Data** → **MLP**

These model outputs will eventually be combined through a feature-fusion layer.

The combined representation will be used for:

- Threat Category
- Priority
- Confidence
- Recommended Actions

### MLP

The Multi-Layer Perceptron is planned for structured security features and classification tasks such as:

- Incident metadata
- Threat characteristics
- Structured security indicators
- Priority prediction

### LSTM

The Long Short-Term Memory network is planned for sequential and text-based information such as:

- Suspicious emails
- Security messages
- Incident descriptions
- Other textual evidence

### CNN

The Convolutional Neural Network is planned for visual and spatial security information such as:

- Suspicious screenshots
- Fake login pages
- Malicious webpage screenshots
- Other visual security evidence

> These models are part of the planned architecture and will be trained and evaluated during later development stages.

---

## Threat Categories

The initial system is planned to support categories such as:

- Phishing
- Credential Theft
- Malware
- Business Email Compromise
- Spam
- Benign
- Other Suspicious Activity

The final categories may be refined during dataset creation and model development.

---

## Incident Priority

ThreatLens AI is planned to use a four-level incident priority system:

| Priority | Severity |
|----------|----------|
| P1 | Critical |
| P2 | High |
| P3 | Medium |
| P4 | Low |

AI-generated priority recommendations will be reviewed by security analysts.

---

## User Roles

### Client

Clients will be able to:

- Register and log in
- Submit security incidents
- Provide incident evidence
- View AI analysis
- View threat category
- View incident priority
- Track incident status
- View incident history
- Receive notifications
- Access reports

### Security Analyst

Security analysts will be able to:

- View assigned incidents
- Review AI analysis
- Investigate incidents
- Review evidence
- Add investigation notes
- Accept AI recommendations
- Modify AI recommendations
- Reject AI recommendations
- Change incident priority
- Escalate incidents
- Resolve incidents
- Close incidents

### Administrator

Administrators will be able to:

- Manage users
- Manage security analysts
- View organization-wide incidents
- Assign incidents
- Review escalations
- Monitor analyst workload
- View security analytics
- Monitor AI performance
- Generate reports
- Review audit logs

---

## Supported Incident Types

The platform is built around a central Security Incident entity.

Initial incident types include:

- Suspicious Email
- Suspicious URL
- Suspicious Message
- Suspicious File
- Suspicious Screenshot
- Other / Custom Security Incident

Different incident types can be routed to appropriate AI analysis pipelines.

---

## AI-Assisted Analysis

For each security incident, the AI system is intended to provide:

- Threat category
- Threat score
- Priority recommendation
- Confidence score
- AI-generated summary
- Recommended response actions

Example:

**Threat Category:** Phishing

**Priority:** P2 - High

**Confidence:** 94%

**Recommended Actions:**

- Quarantine the email
- Block the sender
- Inspect the affected account
- Notify the security team

The final decision remains with the security analyst.

---

## Human-in-the-Loop

AI recommendations are not intended to automatically become final security decisions.

The analyst can:

- Accept the recommendation
- Modify the recommendation
- Reject the recommendation

This approach allows the platform to track:

- AI recommendation acceptance
- Human overrides
- AI-human agreement
- Analyst decisions
- Model performance

---

## Planned Dashboards

### Client Dashboard

Planned metrics include:

- Security Score
- Total incidents
- Threats detected
- Critical incidents
- Resolved incidents
- Detection rate
- Average response time
- Average resolution time
- False alarm rate
- Incident resolution rate
- Incident trends
- Threat category distribution
- Recent incidents

### Analyst Dashboard

Planned metrics include:

- Assigned incidents
- Open incidents
- Critical incidents
- Resolved incidents
- Average resolution time
- AI confidence
- AI recommendation agreement
- Pending investigations
- Escalated incidents
- Analyst workload

### Administrator Dashboard

Planned metrics include:

- Total incidents
- Open incidents
- Critical incidents
- Threat trends
- Priority distribution
- Threat category distribution
- Average resolution time
- Escalation rate
- Analyst performance
- AI classification performance
- Precision
- Recall
- F1-score
- AI-human agreement

---

## Model Evaluation

AI models will be evaluated using standard machine learning metrics including:

- Accuracy
- Precision
- Recall
- F1-score
- Confusion Matrix

Model performance values will only be added after actual training and testing.

---

## System Architecture

The planned application architecture consists of:

**Frontend**

React + TypeScript + Vite

↓

**Backend**

FastAPI + Python

↓

**Database**

PostgreSQL

↓

**AI Inference Pipeline**

MLP + LSTM + CNN

The backend will act as the main application layer connecting the frontend, database, authentication system, incident-management system, and AI inference services.

---

## Technology Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- Recharts

### Backend

- Python
- FastAPI
- SQLAlchemy
- JWT Authentication

### Database

- PostgreSQL

### AI / Machine Learning

- Python
- TensorFlow / Keras
- Scikit-learn
- Pandas
- NumPy
- Matplotlib

### Development & Deployment

- Git
- GitHub
- Docker
- Docker Compose

---

## Project Structure

The planned repository structure is:

- `frontend/` — React frontend
- `backend/` — FastAPI backend
- `ai/` — AI and machine-learning components
- `ai/datasets/` — Raw and processed datasets
- `ai/preprocessing/` — Data preprocessing
- `ai/models/` — MLP, LSTM and CNN models
- `ai/training/` — Model training
- `ai/evaluation/` — Model evaluation
- `ai/inference/` — AI inference
- `database/` — Database-related components
- `tests/` — Automated tests
- `docs/` — Architecture, API and research documentation
- `.gitignore` — Git ignore configuration
- `README.md` — Project documentation
- `docker-compose.yml` — Container configuration
- `LICENSE` — Project license

---

## Incident Lifecycle

The planned incident lifecycle is:

**Submitted → Assigned → Investigating → Escalated → Resolved → Closed**

Not every incident will require escalation.

Each incident will maintain a record of important actions and status changes.

---

## Incident Data Model

A security incident is planned to contain information such as:

- Incident ID
- Client
- Incident Type
- Description
- Evidence
- Threat Category
- Threat Score
- AI Confidence
- AI Priority
- Analyst Priority
- Recommended Actions
- Status
- Assigned Analyst
- Investigation Notes
- Timeline
- Resolution
- Created Timestamp
- Updated Timestamp

---

## Security Considerations

Security is a core requirement of the platform.

Planned security mechanisms include:

- Role-Based Access Control (RBAC)
- JWT authentication
- Password hashing
- Input validation
- Protected API endpoints
- Environment-based secrets
- Audit logging
- Controlled access to incident evidence
- Secure database configuration

---

## Testing Strategy

The project will use controlled synthetic users and security scenarios for testing.

The test environment will include simulated:

- Client accounts
- Analyst accounts
- Administrator accounts
- Security incidents
- Threat scenarios
- Benign scenarios

Testing will cover:

- Authentication
- Authorization
- Role-based access
- Incident creation
- Incident lifecycle
- AI predictions
- Analyst overrides
- Escalation workflows
- Dashboard calculations
- API endpoints
- Edge cases
- Security controls

---

## Academic Scope

ThreatLens AI is being developed as a practical application of concepts from Artificial Intelligence and Neural Networks, including:

- Multi-Layer Perceptrons
- Activation Functions
- Backpropagation
- Optimization Methods
- Regularization
- Deep Learning
- Convolutional Neural Networks
- Recurrent Neural Networks
- LSTM Networks
- Model Evaluation

The project applies these concepts to a real-world cybersecurity use case.

---

## Research Component

The project will include research related to:

- Artificial Intelligence in Cybersecurity
- Security Incident Management
- Phishing Detection
- Deep Learning for Cybersecurity
- Multimodal Threat Analysis
- Human-in-the-Loop Security Systems

Research documentation will be maintained under:

`docs/research/`

---

## Development Roadmap

### Phase 1 — Application Foundation

- [ ] Repository setup
- [ ] Project structure
- [ ] React frontend
- [ ] FastAPI backend
- [ ] PostgreSQL setup
- [ ] Docker configuration
- [ ] Environment configuration
- [ ] Backend health check

### Phase 2 — Authentication & RBAC

- [ ] User registration
- [ ] Login
- [ ] JWT authentication
- [ ] Client role
- [ ] Analyst role
- [ ] Administrator role
- [ ] Protected routes

### Phase 3 — Incident Management

- [ ] Incident database model
- [ ] Incident submission
- [ ] Evidence handling
- [ ] Incident assignment
- [ ] Incident status lifecycle
- [ ] Investigation notes
- [ ] Escalation
- [ ] Resolution
- [ ] Closure

### Phase 4 — Dashboards

- [ ] Client dashboard
- [ ] Analyst dashboard
- [ ] Administrator dashboard
- [ ] Incident analytics
- [ ] Security metrics
- [ ] Charts and trends

### Phase 5 — AI Dataset & Preprocessing

- [ ] Dataset collection
- [ ] Data cleaning
- [ ] Feature engineering
- [ ] Text preprocessing
- [ ] Image preprocessing
- [ ] Dataset splitting

### Phase 6 — Neural Network Models

- [ ] MLP
- [ ] LSTM
- [ ] CNN
- [ ] Model training
- [ ] Model evaluation
- [ ] Model comparison
- [ ] Model serialization

### Phase 7 — AI Integration

- [ ] AI inference API
- [ ] Threat classification
- [ ] Priority prediction
- [ ] Confidence scoring
- [ ] Feature fusion
- [ ] Recommended actions
- [ ] AI → Incident pipeline

### Phase 8 — Analytics & Trust

- [ ] AI-human agreement
- [ ] Human override tracking
- [ ] AI performance dashboard
- [ ] Precision / Recall / F1
- [ ] Incident reports
- [ ] Audit logs

### Phase 9 — Testing & Deployment

- [ ] Unit testing
- [ ] Integration testing
- [ ] End-to-end testing
- [ ] Security testing
- [ ] Docker deployment
- [ ] Documentation
- [ ] Final demonstration

---

## Current Development Milestone

### THREATLENS-001 — Application Foundation

The first milestone is to establish a clean and runnable foundation consisting of:

**React Frontend → FastAPI Backend → PostgreSQL Database**

After the foundation is complete, development will proceed to authentication and role-based access control.

---

## Project Disclaimer

ThreatLens AI is an academic and research-oriented project under active development.

The system is not intended to replace professional cybersecurity teams, Security Operations Centers, or established security products.

AI-generated classifications, priorities, and recommendations should be reviewed by qualified security personnel before being used for real-world security decisions.

---

## Author

**Parth Singh**

B.Tech — Cyber Security  
Amrita Vishwa Vidyapeetham

---

## License

This project is licensed under the MIT License.

See the `LICENSE` file for details.
