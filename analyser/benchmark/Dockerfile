# Analyser benchmark image: Python analyser code + Panako, for measuring how
# fast a machine (e.g. a NAS) runs the preview analyses. Build from analyser/:
#   docker build -f benchmark/Dockerfile -t fomoplayer-analyser-bench .

# Panako 2.1 builds with Gradle 7.2, which does not run on Java 17.
FROM eclipse-temurin:11-jdk AS panako
ARG PANAKO_COMMIT=f1248f7a35a06af449f02f7df33c4cfdc1aeedc1
RUN apt-get update && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/*
RUN git clone https://github.com/JorenSix/Panako.git /panako \
 && cd /panako && git checkout "$PANAKO_COMMIT" \
 && ./gradlew --no-daemon shadowJar \
 && cp build/libs/panako-*-all.jar /panako.jar

FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg openjdk-17-jre-headless \
 && rm -rf /var/lib/apt/lists/*

# Same layout as `./gradlew install`: jar, launcher and defaults in ~/.panako.
COPY --from=panako /panako.jar /root/.panako/panako.jar
COPY --from=panako /panako/resources/defaults/config.properties \
                   /panako/resources/defaults/logging.properties /root/.panako/
COPY --from=panako /panako/resources/defaults/panako /usr/local/bin/panako
RUN chmod +x /usr/local/bin/panako && mkdir -p /root/.panako/log

WORKDIR /analyser
COPY requirements.txt .
# Only the packages the benchmarked code imports, at the versions the analyser pins.
RUN pip install --no-cache-dir $(grep -E '^(essentia-tensorflow|numpy|scipy|matplotlib|pydub|python-dotenv|requests)==' requirements.txt)
COPY . .

ENTRYPOINT ["python", "benchmark/bench.py"]
