# Spec Delta

## ADDED Requirements

### Requirement: The job MUST wait for a sleeping embedding service to wake

When a request to the embedding service fails to connect, the job SHALL retry
it with growing waits, about 30 seconds in all, and SHALL NOT retry a request
that received an HTTP answer. After one sample's retries are used up without
connecting, the job SHALL try the run's remaining samples once each without
waiting again.

#### Scenario: Upload while the service sleeps
- **GIVEN** the embedding service refuses connections for the first few seconds while it wakes
- **WHEN** the job sends a pending sample
- **THEN** it retries until the service answers and stores the sample's embedding in the same run

#### Scenario: HTTP errors are final
- **WHEN** the embedding service answers a sample with 422
- **THEN** the job does not retry it and lists the sample's error in the run result

#### Scenario: Service down for the whole run
- **GIVEN** the embedding service refuses every connection
- **WHEN** the job runs with three pending samples
- **THEN** the first sample is retried until its waits are used up, the other two are tried once each, and all three are listed as failed
