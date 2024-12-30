from base64 import urlsafe_b64encode
from hashlib import sha256
from typing import Any
import json
import logging
import os
import re
import requests
import uuid

global_state = dict()


class ClientState:
    def __init__(self):
        self.state = str(uuid.uuid4())
        self.nonce = str(uuid.uuid4())
        verifier = urlsafe_b64encode(os.urandom(32)).rstrip(b"=")
        self.code_challenge = (
            urlsafe_b64encode(sha256(verifier).digest()).rstrip(b"=").decode("utf-8")
        )
        self.code_verifier = verifier.decode("utf-8")
        global_state[self.state] = self


def get_client_state(authorization_response: dict) -> ClientState:
    s = authorization_response.get("state")
    if s is None:
        raise Exception("invalid state")
    state = global_state.get(s[0])
    if state is None:
        raise Exception("invalid state")
    return state


class OpenIDConfiguration:
    provider: Any = None

    def __init__(self, openid_configuration: str):
        if re.match("^http(s)?:", openid_configuration):
            logging.debug(f"GET {openid_configuration}")
            r = requests.get(openid_configuration)
            r.raise_for_status()
            self.provider = r.json()
        else:
            logging.debug(f"read {openid_configuration}")
            with open(openid_configuration, "r", encoding="utf-8-sig") as fp:
                self.provider = json.loads(fp.read())

    @property
    def issuer(self):
        if "issuer" not in self.provider:
            raise Exception("missing issuer")
        return self.provider["issuer"]

    @property
    def authorization_endpoint(self):
        if "authorization_endpoint" not in self.provider:
            raise Exception("missing authorization_endpoint")
        return self.provider["authorization_endpoint"]

    @property
    def token_endpoint(self):
        if "token_endpoint" not in self.provider:
            raise Exception("missing token_endpoint")
        return self.provider["token_endpoint"]

    @property
    def userinfo_endpoint(self):
        if "userinfo_endpoint" not in self.provider:
            return None
        return self.provider["userinfo_endpoint"]


class ClientConfiguration:
    client: Any = None
    scope: str = "openid"

    def __init__(
            self, client_configuration: str, client_id: str, client_secret: str,
            scope: str = None
    ):
        logging.debug(f"read {client_configuration}")
        with open(client_configuration, "r", encoding="utf-8-sig") as fp:
            self.client = json.loads(fp.read())
            self.client["client_id"] = client_id
            self.client["client_secret"] = client_secret
        if scope is not None:
            self.scope = scope
        elif "scope" in self.client:
            self.scope = self.client["scope"]
        else:
            self.scope = "openid"

    @property
    def client_id(self):
        if "client_id" not in self.client:
            raise Exception("missing client_id")
        return self.client["client_id"]

    @property
    def client_secret(self):
        if "client_secret" not in self.client:
            return None
        return self.client["client_secret"]

    @property
    def redirect_uri(self):
        if "redirect_uris" not in self.client:
            raise Exception("missing redirect_uris")
        return self.client["redirect_uris"][0]
