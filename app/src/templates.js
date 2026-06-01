// templates.js
// Template library — 29 templates across 6 categories.
// Sources mirrored from docs/test-corpus/<category>/<name>.mmd.
// If you change a template's Mermaid source, change BOTH this file
// and the corresponding .mmd file.

export const CATEGORIES = [
  'Flow & Process',
  'UML',
  'C4 Architecture',
  'Data Visualization',
  'Planning & Time',
  'Specialized',
];

export const TEMPLATES = [
  // ----- Flow & Process (6) -----
  {
    id: 'flow/basic-flowchart',
    category: 'Flow & Process',
    name: 'Basic Flowchart',
    source: `flowchart TD
    Start([Start]) --> Input[Read input]
    Input --> Validate{Valid?}
    Validate -->|Yes| Process[Process data]
    Validate -->|No| Error[Show error]
    Process --> Output[Write output]
    Error --> End([End])
    Output --> End
`,
  },
  {
    id: 'flow/elk-flowchart',
    category: 'Flow & Process',
    name: 'ELK Flowchart',
    source: `---
config:
  layout: elk
---
flowchart TD
    A[Start] --> B{Validate Input}
    B -->|Valid| C[Process Data]
    B -->|Invalid| D[Show Error]
    C --> E[Save to DB]
    D --> F[Log Error]
    E --> G[Send Notification]
    F --> G
    G --> H[End]
`,
  },
  {
    id: 'flow/decision-tree',
    category: 'Flow & Process',
    name: 'Decision Tree',
    source: `flowchart TD
    Start([Customer inquiry]) --> Type{Inquiry<br/>type?}
    Type -->|Sales| Lead[Qualify lead]
    Type -->|Support| Ticket[Create ticket]
    Type -->|Billing| Account[Lookup account]
    Lead --> Hot{Hot lead?}
    Hot -->|Yes| Sales[Assign to sales]
    Hot -->|No| Nurture[Add to nurture list]
    Ticket --> Priority{Priority?}
    Priority -->|High| Escalate[Escalate to L2]
    Priority -->|Normal| Queue[Standard queue]
    Account --> Resolve[Resolve issue]
    style Type fill:#fef3c7,stroke:#d97706
    style Hot fill:#fef3c7,stroke:#d97706
    style Priority fill:#fef3c7,stroke:#d97706
`,
  },
  {
    id: 'flow/cyclic-process',
    category: 'Flow & Process',
    name: 'Cyclic Process Loop',
    source: `---
config:
  layout: elk
---
flowchart TB
    Start([User opens app]) --> Auth{Authenticated?}
    Auth -->|No| Login[Show login form]
    Auth -->|Yes| Dashboard[Load dashboard]
    Login --> Submit{Credentials valid?}
    Submit -->|No| LoginError[Display error]
    LoginError --> Login
    Submit -->|Yes| Session[Create session]
    Session --> Dashboard
    Dashboard --> FetchData[Fetch user data]
    FetchData --> Cache{Cache hit?}
    Cache -->|Yes| Render[Render UI]
    Cache -->|No| DB[(Query database)]
    DB --> Store[Store in cache]
    Store --> Render
    Render --> Idle[Idle state]
    Idle --> Logout([User logs out])
    Logout --> Start
`,
  },
  {
    id: 'flow/git-graph',
    category: 'Flow & Process',
    name: 'Git Graph',
    source: `---
title: Feature branch workflow
---
gitGraph
    commit id: "init"
    commit id: "setup"
    branch feature
    checkout feature
    commit id: "feature-a"
    commit id: "feature-b"
    checkout main
    commit id: "hotfix"
    checkout feature
    merge main
    commit id: "feature-c"
    checkout main
    merge feature tag: "v1.0"
`,
  },
  {
    id: 'flow/block-diagram',
    category: 'Flow & Process',
    name: 'Block Diagram',
    source: `block-beta
    columns 3
    Frontend["Frontend"] Backend["Backend"] Database[("Database")]
    space:3
    Cache[("Redis Cache")]:3
    space:3
    CDN["CDN"] LoadBalancer["Load Balancer"] Monitor["Monitoring"]
    Frontend --> Backend
    Backend --> Database
    Backend --> Cache
`,
  },

  // ----- UML (5) -----
  {
    id: 'uml/sequence',
    category: 'UML',
    name: 'Sequence Diagram',
    source: `sequenceDiagram
    participant U as User
    participant W as Web App
    participant A as Auth Service
    participant D as Database
    U->>W: Login request
    W->>A: Validate credentials
    A->>D: Query user
    D-->>A: User record
    alt valid credentials
        A-->>W: Auth token
        W-->>U: Dashboard
    else invalid
        A-->>W: 401 Unauthorized
        W-->>U: Error message
    end
`,
  },
  {
    id: 'uml/class',
    category: 'UML',
    name: 'Class Diagram',
    source: `classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }
    class Dog {
        +String breed
        +fetch()
    }
    class Owner {
        +String name
        +adopt(Animal)
    }
    Animal <|-- Dog
    Owner "1" o-- "*" Animal
`,
  },
  {
    id: 'uml/state',
    category: 'UML',
    name: 'State Diagram',
    source: `stateDiagram-v2
    [*] --> Idle
    Idle --> Loading: Submit
    Loading --> Success: 200 OK
    Loading --> Error: 4xx/5xx
    Success --> Idle: Reset
    Error --> Idle: Reset
    Error --> Loading: Retry
`,
  },
  {
    id: 'uml/requirement',
    category: 'UML',
    name: 'Requirement Diagram',
    source: `requirementDiagram
    requirement user_login {
        id: 1
        text: "Users must authenticate before accessing protected resources"
        risk: high
        verifymethod: test
    }
    requirement password_strength {
        id: 1.1
        text: "Passwords must be at least 12 characters with mixed case"
        risk: medium
        verifymethod: inspection
    }
    element auth_module {
        type: simulation
    }
    element password_validator {
        type: code
    }
    auth_module - satisfies -> user_login
    password_validator - satisfies -> password_strength
    password_strength - derives -> user_login
`,
  },

  // ----- C4 Architecture (5) -----
  {
    id: 'c4/context',
    category: 'C4 Architecture',
    name: 'C4 Context',
    source: `C4Context
    title System Context: Internet Banking
    Person(customer, "Banking Customer", "Customer of the bank with personal accounts")
    System(banking_system, "Internet Banking System", "Allows customers to view information about their accounts and make payments")
    System_Ext(mail_system, "E-mail System", "The internal Microsoft Exchange e-mail system")
    System_Ext(mainframe, "Mainframe Banking System", "Stores all of the core banking information")
    Rel(customer, banking_system, "Uses")
    Rel(banking_system, mail_system, "Sends e-mails")
    Rel(banking_system, mainframe, "Reads from and writes to")
    Rel(mail_system, customer, "Sends e-mails to")
`,
  },
  {
    id: 'c4/container',
    category: 'C4 Architecture',
    name: 'C4 Container',
    source: `C4Container
    title Container diagram: Internet Banking
    Person(customer, "Banking Customer")
    System_Boundary(banking, "Internet Banking") {
        Container(web_app, "Web Application", "Java, Spring MVC", "Delivers static content")
        Container(spa, "Single-Page App", "JavaScript, Angular", "Banking functionality in browser")
        Container(mobile_app, "Mobile App", "Swift / Kotlin", "Banking functionality on mobile")
        ContainerDb(database, "Database", "PostgreSQL", "User accounts, transactions")
        Container(api, "API Application", "Java, Spring Boot", "Provides banking API")
    }
    Rel(customer, web_app, "Uses", "HTTPS")
    Rel(customer, spa, "Uses", "HTTPS")
    Rel(customer, mobile_app, "Uses")
    Rel(web_app, spa, "Delivers", "HTTPS")
    Rel(spa, api, "Calls", "JSON/HTTPS")
    Rel(mobile_app, api, "Calls", "JSON/HTTPS")
    Rel(api, database, "Reads/writes", "SQL/JDBC")
`,
  },
  {
    id: 'c4/component',
    category: 'C4 Architecture',
    name: 'C4 Component',
    source: `C4Component
    title Component diagram: API Application
    Container_Boundary(api, "API Application") {
        Component(sign_in, "Sign In Controller", "Spring MVC Controller", "User sign-in")
        Component(accounts, "Accounts Controller", "Spring MVC Controller", "Account info")
        Component(security, "Security Component", "Spring Bean", "Authentication and authorization")
        Component(mainframe_facade, "Mainframe Facade", "Spring Bean", "Façade for mainframe banking system")
    }
    ContainerDb(database, "Database", "PostgreSQL")
    System_Ext(mainframe, "Mainframe Banking System")
    Rel(sign_in, security, "Uses")
    Rel(accounts, mainframe_facade, "Uses")
    Rel(security, database, "Reads from", "JDBC")
    Rel(mainframe_facade, mainframe, "Uses", "XML/HTTPS")
`,
  },
  {
    id: 'c4/dynamic',
    category: 'C4 Architecture',
    name: 'C4 Dynamic',
    source: `C4Dynamic
    title Dynamic diagram: User sign-in flow
    Person(customer, "Banking Customer")
    Container(spa, "Single-Page App", "JavaScript, Angular")
    Container(api, "API Application", "Java, Spring Boot")
    Component(security, "Security Component", "Spring Bean")
    ContainerDb(database, "Database", "PostgreSQL")
    Rel(customer, spa, "1. Submits credentials")
    Rel(spa, api, "2. POST /sign-in")
    Rel(api, security, "3. Validates")
    Rel(security, database, "4. Looks up user")
    Rel(database, security, "5. Returns user record")
    Rel(security, api, "6. Token")
    Rel(api, spa, "7. 200 OK + JWT")
`,
  },
  {
    id: 'c4/deployment',
    category: 'C4 Architecture',
    name: 'C4 Deployment',
    source: `C4Deployment
    title Deployment diagram: Banking Production
    Deployment_Node(plc, "Customer's PC", "Microsoft Windows or Apple macOS") {
        Deployment_Node(browser, "Web Browser", "Chrome, Firefox, Safari, Edge") {
            Container(spa, "Single-Page App", "JavaScript and Angular")
        }
    }
    Deployment_Node(aws, "Big Bank AWS", "us-east-1") {
        Deployment_Node(eks, "EKS Cluster", "Kubernetes 1.28") {
            Container(api, "API Application", "Java and Spring Boot")
            Container(web_app, "Web Application", "Java and Spring MVC")
        }
        Deployment_Node(rds, "Amazon RDS", "PostgreSQL 16") {
            ContainerDb(database_primary, "Database (primary)", "PostgreSQL")
            ContainerDb(database_replica, "Database (replica)", "PostgreSQL")
        }
    }
    Rel(spa, api, "Calls", "JSON/HTTPS")
    Rel(api, database_primary, "Reads/writes", "SQL/JDBC")
    Rel(database_primary, database_replica, "Replicates", "async")
`,
  },

  // ----- Data Visualization (6) -----
  {
    id: 'data/er',
    category: 'Data Visualization',
    name: 'ER Diagram',
    source: `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER {
        string name
        string email
    }
    ORDER {
        int id
        date placed_at
    }
    LINE-ITEM {
        int quantity
        string sku
    }
`,
  },
  {
    id: 'data/pie',
    category: 'Data Visualization',
    name: 'Pie Chart',
    source: `pie title Browser market share Q1 2026
    "Chrome" : 65
    "Safari" : 18
    "Firefox" : 7
    "Edge" : 8
    "Other" : 2
`,
  },
  {
    id: 'data/xychart',
    category: 'Data Visualization',
    name: 'XY Chart',
    source: `xychart-beta
    title "Monthly Revenue"
    x-axis [Jan, Feb, Mar, Apr, May, Jun]
    y-axis "Revenue (USD)" 0 --> 100000
    bar [42000, 56000, 51000, 68000, 73000, 81000]
    line [42000, 56000, 51000, 68000, 73000, 81000]
`,
  },
  {
    id: 'data/quadrant',
    category: 'Data Visualization',
    name: 'Quadrant Chart',
    source: `quadrantChart
    title Reach vs Engagement of Marketing Campaigns
    x-axis Low Reach --> High Reach
    y-axis Low Engagement --> High Engagement
    quadrant-1 Expand
    quadrant-2 Promote
    quadrant-3 Re-evaluate
    quadrant-4 Improve
    Campaign A: [0.30, 0.60]
    Campaign B: [0.45, 0.23]
    Campaign C: [0.57, 0.69]
    Campaign D: [0.78, 0.34]
    Campaign E: [0.40, 0.34]
    Campaign F: [0.35, 0.78]
`,
  },
  {
    id: 'data/sankey',
    category: 'Data Visualization',
    name: 'Sankey Diagram',
    source: `sankey-beta
    Bio-conversion of feedstocks,Bio-conversion,124.729
    Pumped heat,Heating and cooling - homes,193.026
    Pumped heat,Heating and cooling - commercial,70.672
    Geothermal,Heating and cooling - homes,1.483
    Solar PV,Electricity grid,59.901
    Solar Thermal,Heating and cooling - homes,19.263
    Wind,Electricity grid,289.366
    Hydro,Electricity grid,55.16
    Electricity grid,Industry,342.165
    Electricity grid,Heating and cooling - homes,158.281
`,
  },
  {
    id: 'data/radar',
    category: 'Data Visualization',
    name: 'Radar Chart',
    source: `radar-beta
    axis Communication, Leadership, Technical, Strategy, Execution, Collaboration
    curve Alice{75, 80, 90, 70, 85, 80}
    curve Bob{60, 70, 85, 90, 75, 70}
    max 100
    min 0
`,
  },

  // ----- Planning & Time (4) -----
  {
    id: 'planning/gantt',
    category: 'Planning & Time',
    name: 'Gantt Chart',
    source: `gantt
    title Project Schedule
    dateFormat YYYY-MM-DD
    section Design
    Requirements      :done, t1, 2026-01-01, 3d
    Wireframes        :done, t2, after t1, 4d
    Prototype         :active, t3, after t2, 5d
    section Build
    Backend setup     :t4, after t3, 4d
    Frontend setup    :t5, after t4, 4d
    Integration       :t6, after t5, 3d
    section Launch
    QA & polish       :t7, after t6, 3d
    Release           :t8, after t7, 1d
`,
  },
  {
    id: 'planning/journey',
    category: 'Planning & Time',
    name: 'User Journey',
    source: `journey
    title User onboarding journey
    section Discovery
      Land on homepage: 5: User
      Read features   : 4: User
      Click sign up   : 3: User
    section Signup
      Fill form       : 2: User
      Email verify    : 1: User
      Complete profile: 3: User
    section First use
      View tutorial   : 4: User
      Create first doc: 5: User
`,
  },
  {
    id: 'planning/timeline',
    category: 'Planning & Time',
    name: 'Timeline',
    source: `timeline
    title History of Mermaid
    section 2014
        Mermaid created : First commit by Knut Sveidqvist : Initial flowchart support
    section 2015-2017
        Sequence diagrams : Class diagrams added : Gantt charts added
    section 2018-2020
        State diagrams : ER diagrams : User journey
    section 2021-2023
        Mindmaps : Timeline diagrams : Git graphs
        C4 diagrams : Sankey diagrams : Quadrant charts
    section 2024-2026
        Block diagrams : Packet diagrams : Architecture diagrams
        Radar charts : ZenUML integration
`,
  },
  {
    id: 'planning/kanban',
    category: 'Planning & Time',
    name: 'Kanban Board',
    source: `kanban
    Todo
        [Design new feature spec]@{ ticket: "PROJ-201", assigned: "alice", priority: "Very High" }
        [Set up CI/CD pipeline]@{ ticket: "PROJ-202", assigned: "bob" }
        [Write API documentation]@{ ticket: "PROJ-203", assigned: "carol", priority: "Low" }
    In Progress
        [Implement user authentication]@{ ticket: "PROJ-198", assigned: "dave", priority: "High" }
        [Database schema migration]@{ ticket: "PROJ-199", assigned: "eve" }
    Code Review
        [Refactor login flow]@{ ticket: "PROJ-195", assigned: "frank" }
    Done
        [Initial project setup]@{ ticket: "PROJ-190", assigned: "alice" }
        [Choose tech stack]@{ ticket: "PROJ-191", assigned: "bob" }
`,
  },

  // ----- Specialized (3) -----
  {
    id: 'specialized/mindmap',
    category: 'Specialized',
    name: 'Mind Map',
    source: `mindmap
  root((Mermaid))
    Origins
      Long history
      Tony Buzan popularised
    Diagram types
      Flow
        Flowchart
        Git Graph
      UML
        Sequence
        Class
        State
      Data
        Pie
        XY Chart
        Sankey
      Project
        Gantt
        Journey
    Use cases
      Documentation
      Brainstorming
      Planning
      Education
`,
  },
  {
    id: 'specialized/packet',
    category: 'Specialized',
    name: 'Packet Diagram',
    source: `packet-beta
    title TCP Packet
    0-15: "Source Port"
    16-31: "Destination Port"
    32-63: "Sequence Number"
    64-95: "Acknowledgment Number"
    96-99: "Data Offset"
    100-105: "Reserved"
    106: "URG"
    107: "ACK"
    108: "PSH"
    109: "RST"
    110: "SYN"
    111: "FIN"
    112-127: "Window"
    128-143: "Checksum"
    144-159: "Urgent Pointer"
    160-191: "Options (variable)"
    192-223: "Data (variable)"
`,
  },
  {
    id: 'specialized/architecture',
    category: 'Specialized',
    name: 'Architecture Diagram',
    source: `architecture-beta
    group api(cloud)[API Layer]
    group data(cloud)[Data Layer]

    service web(internet)[Web] in api
    service mobile(internet)[Mobile App] in api
    service gateway(server)[API Gateway] in api
    service auth(server)[Auth Service] in api
    service users(server)[User Service] in api

    service postgres(database)[PostgreSQL] in data
    service redis(database)[Redis] in data
    service s3(disk)[S3 Storage] in data

    web:B -- T:gateway
    mobile:B -- T:gateway
    gateway:R -- L:auth
    gateway:B -- T:users
    auth:R -- L:postgres
    users:R -- L:postgres
    users:R -- L:redis
    users:B -- T:s3
`,
  },
];
