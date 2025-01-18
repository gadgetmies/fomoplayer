from oidc_common import OpenIDConfiguration, ClientConfiguration, ClientState
from threading import Thread, Event
from urllib.parse import parse_qs
from urllib.parse import urlencode
from urllib.parse import urlsplit
import http.server
import logging
import socket

# html page when browser invokes authorization response

html = """
<body onload="window.history.replaceState(null, null, location.pathname); window.close()">
<p>The operation was completed. You may close this window.</p>
<p><input type="button" onclick="window.close()" value="Close"></input></p>
</body>
"""

class LoopbackHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_GET(self):
        httpd = self.server
        r = urlsplit(self.path)

        # handles authorization response
        if r.path == httpd.redirect_path:
            logging.debug(f"authorization_response = {self.path}")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            body = html.encode("utf-8")
            self.send_header("Content-Length", len(body))
            self.end_headers()
            self.wfile.write(body)
            httpd.authorization_response = parse_qs(r.query)
            httpd.done.set()
            # logging.debug(self.path)
            return

        if r.path == "/favicon.ico":
            self.send_error(404)
            self.end_headers()
            return

        # any other request generates authorization request
        logging.debug(f"GET {self.path}")
        url = httpd.authorization_request()
        self.send_response(302)
        self.send_header("Location", url)
        self.end_headers()
        # logging.debug(str(url))


class LoopbackServer(http.server.ThreadingHTTPServer):
    def __init__(
            self, provider: OpenIDConfiguration, client: ClientConfiguration, args={}
    ):
        if socket.has_ipv6:
            self.address_family = socket.AF_INET6
        super().__init__(("localhost", 0), LoopbackHandler)
        # configuration
        self.provider = provider
        self.client = client
        self.args = args
        # holds authorization response
        self.authorization_response = None
        # event to signal shutdown
        self.done = Event()
        # dynamic port with loopback handler
        self.__port = self.socket.getsockname()[1]

    @property
    def active(self):
        return self.authorization_response is None or not self.done.is_set()

    @property
    def port(self):
        return self.__port

    @property
    def base_uri(self):
        return f"http://localhost:{self.port}"

    @property
    def redirect_path(self):
        r = urlsplit(self.client.redirect_uri)
        return r.path

    @property
    def redirect_uri(self):
        return self.base_uri + self.redirect_path

    def authorization_request_params(self):
        state = ClientState()
        params = {
            "response_type": "code",
            "client_id": self.client.client_id,
            "scope": self.client.scope,
            "redirect_uri": self.redirect_uri,
            "code_challenge": state.code_challenge,
            "code_challenge_method": "S256",
            "state": state.state,
            "nonce": state.nonce,
            "access_type": "offline"
        }
        for i in (
                "scope",
                "acr_values",
                "ui_locales",
                "login_hint",
                "prompt",
                "max_age",
                "ftn_spname",
                "template",
        ):
            if i in self.args and self.args[i] is not None:
                params[i] = self.args[i]
        return params

    def authorization_request(self):
        params = self.authorization_request_params()
        logging.debug(f"authorization_request_params = {params}")
        url = self.provider.authorization_endpoint + "?" + urlencode(params)
        logging.debug(f"authorization_request = {url}")
        return url

    def server_thread(self):
        while self.active:
            self.timeout = 0.5
            try:
                self.handle_request()
            except:
                pass

    def wait_authorization_response(self):
        t = Thread(
            name="LoopbackServer", target=lambda: self.server_thread(), daemon=True
        )
        t.start()
        try:
            self.done.wait()
        except KeyboardInterrupt:
            self.done.set()
        return self.authorization_response